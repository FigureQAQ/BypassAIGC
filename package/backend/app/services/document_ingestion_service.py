from __future__ import annotations

import hashlib
import json
import re
from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from lxml import etree

from app.config import settings
from app.word_formatter.utils.ooxml import DocxPackage

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
NSMAP = {"w": W_NS}


@dataclass
class DocumentBlock:
    block_id: str
    text: str
    block_type: str
    block_index: int
    offset_start: int
    offset_end: int
    structure_meta: Dict[str, Any] = field(default_factory=dict)


@dataclass
class IngestionResult:
    source_type: str
    original_text: str
    source_filename: str
    source_mime_type: Optional[str]
    source_file_size: int
    source_file_blob: Optional[bytes]
    source_text_hash: str
    word_count: int
    char_count: int
    chinese_char_count: int
    english_word_count: int
    document_meta: Dict[str, Any]
    preserve_format_available: bool
    blocks: List[DocumentBlock]


class DocumentIngestionError(ValueError):
    pass


def _get_extension(filename: str) -> str:
    return filename.rsplit(".", 1)[-1].lower() if "." in filename else ""


def validate_upload(filename: str, content: bytes) -> str:
    if not filename:
        raise DocumentIngestionError("filename cannot be empty")

    ext = _get_extension(filename)
    if ext not in {"docx", "pdf", "md", "markdown"}:
        raise DocumentIngestionError("Only .docx, .pdf, .md, and .markdown files are supported")

    max_size_mb = settings.MAX_UPLOAD_FILE_SIZE_MB
    if max_size_mb > 0:
        file_size_mb = len(content) / (1024 * 1024)
        if file_size_mb > max_size_mb:
            raise DocumentIngestionError(
                f"File size ({file_size_mb:.1f} MB) exceeds the limit ({max_size_mb} MB)"
            )

    return ext


def count_words(text: str) -> Dict[str, int]:
    chinese_chars = re.findall(r"[\u4e00-\u9fff]", text)
    english_words = re.findall(r"[A-Za-z]+(?:[-'][A-Za-z]+)?", text)
    return {
        "char_count": len(text),
        "chinese_char_count": len(chinese_chars),
        "english_word_count": len(english_words),
        "word_count": len(chinese_chars) + len(english_words),
    }


def _compact_text(text: str) -> str:
    return re.sub(r"\s+", "", text).lower()


def _load_style_names(package: DocxPackage) -> Dict[str, str]:
    if "word/styles.xml" not in package.files:
        return {}

    try:
        root = package.read_xml("word/styles.xml")
    except Exception:
        return {}

    style_names: Dict[str, str] = {}
    for style in root.xpath(".//w:style", namespaces=NSMAP):
        style_id = style.get(f"{{{W_NS}}}styleId")
        name = style.find("w:name", namespaces=NSMAP)
        if style_id and name is not None:
            style_names[style_id] = name.get(f"{{{W_NS}}}val", "")
    return style_names


def _paragraph_style_id(paragraph: etree._Element) -> Optional[str]:
    style = paragraph.find("w:pPr/w:pStyle", namespaces=NSMAP)
    if style is None:
        return None
    return style.get(f"{{{W_NS}}}val")


def _style_tokens(paragraph: etree._Element, style_names: Dict[str, str]) -> str:
    style_id = _paragraph_style_id(paragraph) or ""
    style_name = style_names.get(style_id, "")
    return f"{style_id} {style_name}".lower().replace(" ", "").replace("_", "").replace("-", "")


def _is_body_style(paragraph: etree._Element, style_names: Dict[str, str]) -> bool:
    style_text = _style_tokens(paragraph, style_names)
    if not style_text:
        return False
    if any(token in style_text for token in ("heading", "title", "subtitle", "caption", "toc", "header", "footer", "code")):
        return False
    return any(token in style_text for token in ("normal", "body", "bodytext", "正文", "文本", "姝ｆ枃", "鏂囨湰", "defaultparagraphfont"))


def _paragraph_outline_level(paragraph: etree._Element) -> Optional[int]:
    outline = paragraph.find("w:pPr/w:outlineLvl", namespaces=NSMAP)
    if outline is None:
        return None
    value = outline.get(f"{{{W_NS}}}val")
    try:
        return int(value) if value is not None else None
    except ValueError:
        return None


def _is_numbered_or_bulleted(paragraph: etree._Element) -> bool:
    return paragraph.find("w:pPr/w:numPr", namespaces=NSMAP) is not None


def _looks_like_body_sentence(text: str) -> bool:
    stripped = text.strip()
    compact = _compact_text(stripped)
    if not compact:
        return False
    if any(mark in stripped for mark in "。；;，,.!?"):
        return True
    if re.match(r"^第\s*[一二三四五六七八九十百千万\d]+\s*(部分|点|章|节|篇)[、，,.]?", stripped):
        return True
    if re.match(r"^[（(]?\s*[一二三四五六七八九十百千万\d]+\s*[）)、，,.]\s*", stripped) and len(compact) > 20:
        return True
    return False


def _is_heading_paragraph(paragraph: etree._Element, style_names: Dict[str, str], text: str) -> bool:
    compact = _compact_text(text)
    if len(compact) > 80:
        return False

    style_id = _paragraph_style_id(paragraph)
    style_name = style_names.get(style_id or "", style_id or "").lower()
    if "heading" in style_name or "title" in style_name or "标题" in style_name:
        return True
    if any(token in _style_tokens(paragraph, style_names) for token in ("heading", "title", "subtitle")):
        return True
    if style_id and style_id.isdigit() and 1 <= int(style_id) <= 9:
        return True
    outline_level = _paragraph_outline_level(paragraph)
    if outline_level is not None and outline_level <= 8:
        return True

    if len(compact) <= 40 and (
        re.match(r"^第[一二三四五六七八九十百千万\d]+[章节篇]", compact)
        or re.match(r"^[一二三四五六七八九十]+[、.．-]", compact)
        or re.match(r"^\d+(\.\d+)+[、.．-]?[^\d]{1,40}$", compact)
        or re.match(r"^\d+[、.．-][^\d]{1,40}$", compact)
    ):
        return True
    if _looks_like_body_sentence(text):
        return False
    return False


def _paragraph_has_visual_object(paragraph: etree._Element) -> bool:
    return bool(paragraph.xpath(
        ".//*[local-name()='drawing' or local-name()='pict' or local-name()='object' or local-name()='blip' or local-name()='imagedata']"
    ))


def _paragraph_has_equation(paragraph: etree._Element) -> bool:
    if paragraph.xpath(".//*[local-name()='oMath' or local-name()='oMathPara']"):
        return True

    field_text = "".join(
        node.text or ""
        for node in paragraph.xpath(".//*[local-name()='instrText']")
    )
    return bool(re.search(r"(^|\s)EQ(\s|$|\\\\)", field_text, re.IGNORECASE))


def _is_code_style(paragraph: etree._Element, style_names: Dict[str, str]) -> bool:
    style_text = _style_tokens(paragraph, style_names)
    return any(
        token in style_text
        for token in (
            "code",
            "source",
            "program",
            "preformatted",
            "syntax",
            "monospace",
            "代码",
            "代碼",
            "源码",
            "源代码",
        )
    )


def _looks_like_code_text(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False

    if stripped.startswith(("```", "~~~")):
        return True

    code_patterns = (
        r"^\s*(def|class|import|from|return|if|elif|else|for|while|try|except|async|await)\b",
        r"^\s*(public|private|protected|static|final|void|int|float|double|char|boolean|string)\b",
        r"^\s*(const|let|var|function|export|import)\b",
        r"^\s*#include\s*[<\"]",
        r"\b(console\.log|print\(|printf\(|System\.out\.println|logger\.)",
        r"\b(SELECT|INSERT|UPDATE|DELETE|CREATE|ALTER|DROP)\b.+\b(FROM|WHERE|TABLE|INTO)\b",
        r"[{};]\s*$",
        r"(==|!=|<=|>=|=>|::|&&|\|\|)",
    )
    if any(re.search(pattern, stripped, re.IGNORECASE) for pattern in code_patterns):
        return True

    compact = re.sub(r"\s+", "", stripped)
    if len(compact) < 12:
        return False

    has_cjk = bool(re.search(r"[\u4e00-\u9fff]", stripped))
    code_marks = sum(stripped.count(mark) for mark in ("{", "}", ";", "(", ")", "[", "]", "=>", "==", "!=", "::", "&&", "||"))
    word_like = len(re.findall(r"[A-Za-z_][A-Za-z0-9_]*", stripped))
    return not has_cjk and code_marks >= 4 and word_like >= 2


def _looks_like_formula_text(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False

    if re.search(r"\\(frac|sum|prod|int|sqrt|alpha|beta|gamma|theta|lambda|mu|sigma|delta|begin|end)\b", stripped):
        return True
    if re.search(r"\$[^$]{1,120}\$", stripped):
        return True
    if re.search(r"[∑∫√∞≈≠≤≥±×÷∂∇∈∉∀∃→←⇒⇔]", stripped):
        return True

    operators = re.findall(r"(<=|>=|!=|==|≈|≠|≤|≥|[=+\-*/^])", stripped)
    variable_marks = re.findall(r"\b[A-Za-z]\s*(?:[_^]\s*\{?[A-Za-z0-9]+\}?|\d+)\b", stripped)
    function_marks = re.findall(r"\b(?:sin|cos|tan|log|ln|exp|max|min|argmax|argmin)\s*\(", stripped, re.IGNORECASE)
    if len(operators) >= 2 and (len(variable_marks) >= 1 or len(function_marks) >= 1):
        return True
    if len(operators) >= 3 and len(re.findall(r"\b[A-Za-z]\b", stripped)) >= 2:
        return True

    return False


def _is_symbol_heavy_statement(text: str) -> bool:
    compact = re.sub(r"\s+", "", text.strip())
    if len(compact) < 16:
        return False

    symbols = re.findall(r"[^A-Za-z0-9\u4e00-\u9fff]", compact)
    operators = re.findall(r"[=+\-*/^<>≈≠≤≥∑∫√±×÷∂∇→←]", compact)
    has_letter = bool(re.search(r"[A-Za-z]", compact))
    return has_letter and len(operators) >= 3 and (len(symbols) / max(len(compact), 1)) >= 0.22


def _is_protected_technical_paragraph(
    paragraph: etree._Element,
    style_names: Dict[str, str],
    text: str,
) -> bool:
    return (
        _paragraph_has_equation(paragraph)
        or _is_code_style(paragraph, style_names)
        or _looks_like_code_text(text)
        or _looks_like_formula_text(text)
        or _is_symbol_heavy_statement(text)
    )


def _excluded_section_from_heading_text(text: str) -> Optional[str]:
    compact = _compact_text(text)
    if compact in {"目录", "目錄", "contents", "tableofcontents"}:
        return "toc"
    if compact in {"参考文献", "參考文獻", "references", "bibliography"} or compact.startswith(("参考文献", "參考文獻")):
        return "references"
    if compact in {"附录", "附錄", "appendix"} or compact.startswith(("附录", "附錄")):
        return "appendix"
    return None


def _is_toc_entry(text: str) -> bool:
    stripped = text.strip()
    compact = _compact_text(stripped)
    return (
        "……" in stripped
        or "....." in stripped
        or bool(re.search(r"\.{3,}\s*\d+$", stripped))
        or bool(re.match(r"^\d+(\.\d+)*[^\n]{0,40}\d+$", compact))
    )


def _is_reference_entry(text: str) -> bool:
    stripped = text.strip()
    if not stripped:
        return False
    return bool(
        re.match(r"^\s*\[\d+\]", stripped)
        or re.match(r"^\s*\d+\.\s+.+\d{4}", stripped)
        or re.match(r"^\s*\d+\]\s+", stripped)
    )


def _is_body_heading_text(text: str) -> bool:
    compact = _compact_text(text)
    if not compact or _is_toc_entry(text):
        return False
    if compact in {"正文", "绪论", "绪言", "前言", "引言", "结论", "总结", "introduction", "conclusion"}:
        return True
    if compact.startswith(("绪论", "绪言", "前言", "引言", "结论", "总结", "introduction", "conclusion")) and len(compact) <= 30:
        return True
    if re.match(r"^第[一二三四五六七八九十百千万\d]+[章节篇]", compact):
        return True
    if re.match(r"^chapter\d+", compact):
        return True
    if re.match(r"^\d+(\.\d+)+[、.．-]?[^\d]{1,40}$", compact):
        return True
    if re.match(r"^\d+[、.．-][^\d]{1,40}$", compact):
        return True
    if re.match(r"^[一二三四五六七八九十]+[、.．-][^\d]{1,40}$", compact):
        return True
    if re.match(r"^[（(][一二三四五六七八九十]+[）)][^\d]{1,40}$", compact):
        return True
    if _looks_like_body_sentence(text):
        return False
    return False


def _section_from_heading_text(text: str) -> Optional[str]:
    compact = _compact_text(text)
    if not compact:
        return None
    if compact in {"摘要", "中文摘要"} or compact.startswith("摘要") and len(compact) <= 12:
        return "abstract"
    if compact in {"abstract", "英文摘要"}:
        return "abstract"
    if compact in {"致谢", "谢辞", "acknowledgements", "acknowledgments"} or compact.startswith("致谢") and len(compact) <= 12:
        return "acknowledgement"
    excluded_section = _excluded_section_from_heading_text(text)
    if excluded_section:
        return f"excluded:{excluded_section}"
    if _is_body_heading_text(text):
        return "body"
    return None


def _is_keyword_or_caption(text: str) -> bool:
    stripped = text.strip()
    compact = _compact_text(stripped)
    return (
        compact.startswith("关键词")
        or compact.startswith("keywords")
        or compact.startswith("keyword")
        or bool(re.match(r"^[图表]\s*\d+", stripped))
        or bool(re.match(r"^(figure|table)\s*\d+", stripped, re.IGNORECASE))
    )


def _looks_like_body_paragraph(text: str, paragraph: Optional[etree._Element] = None, style_names: Optional[Dict[str, str]] = None) -> bool:
    compact = _compact_text(text)
    min_length = 30 if paragraph is not None and style_names is not None and _is_body_style(paragraph, style_names) else 50
    if len(compact) < min_length:
        return False
    if _is_toc_entry(text) or _is_keyword_or_caption(text):
        return False
    if _excluded_section_from_heading_text(text):
        return False
    if _is_reference_entry(text):
        return False
    if paragraph is not None and style_names is not None and _is_protected_technical_paragraph(paragraph, style_names, text):
        return False
    return True


def _is_layout_table_paragraph(paragraph: etree._Element) -> bool:
    cells = paragraph.xpath("ancestor::w:tbl[1]//w:tc", namespaces=NSMAP)
    if not cells:
        return False
    return len(cells) <= 2


def _should_start_body_section(
    paragraph: etree._Element,
    style_names: Dict[str, str],
    text: str,
    is_heading: bool,
    current_section: Optional[str],
) -> bool:
    if current_section is not None or is_heading:
        return False
    if _paragraph_has_visual_object(paragraph) or _is_toc_entry(text) or _is_keyword_or_caption(text):
        return False
    if _is_reference_entry(text) or _excluded_section_from_heading_text(text):
        return False
    if _is_protected_technical_paragraph(paragraph, style_names, text):
        return False
    if _looks_like_body_paragraph(text, paragraph, style_names):
        return True
    if _is_body_style(paragraph, style_names) and _looks_like_body_sentence(text):
        return True
    if _is_numbered_or_bulleted(paragraph) and _looks_like_body_sentence(text) and len(_compact_text(text)) >= 20:
        return True
    return False


def _decode_text_content(content: bytes, label: str) -> str:
    for encoding in ("utf-8-sig", "utf-8", "gbk"):
        try:
            return content.decode(encoding)
        except UnicodeDecodeError:
            continue
    raise DocumentIngestionError(f"Unable to parse {label} encoding")


def _markdown_heading_text(raw: str) -> Optional[str]:
    first_line = raw.strip().splitlines()[0] if raw.strip() else ""
    match = re.match(r"^\s{0,3}#{1,6}\s+(.+?)\s*#*\s*$", first_line)
    if match:
        return match.group(1).strip()
    return None


def _markdown_block_kind(raw: str) -> str:
    stripped = raw.strip()
    lines = [line.rstrip() for line in stripped.splitlines() if line.strip()]
    if not stripped:
        return "blank"
    if stripped.startswith(("```", "~~~")):
        return "code_fence"
    if _markdown_heading_text(raw):
        return "heading"
    if stripped in {"---", "***", "___"}:
        return "rule"
    if lines and all(re.match(r"^\s{0,3}>", line) for line in lines):
        return "blockquote"
    if len(lines) >= 2 and any("|" in line for line in lines) and any(re.search(r"\|\s*:?-{3,}:?\s*(\||$)", line) for line in lines[:3]):
        return "table"
    if lines and all(re.match(r"^\s{0,3}([-+*]|\d+[.)])\s+", line) for line in lines):
        return "list"
    if stripped.startswith("<") and stripped.endswith(">"):
        return "html"
    return "paragraph"


def _iter_markdown_blocks(text: str) -> List[Dict[str, Any]]:
    lines = text.splitlines(keepends=True)
    blocks: List[Dict[str, Any]] = []
    position = 0
    index = 0

    while index < len(lines):
        line = lines[index]
        stripped = line.strip()
        if not stripped:
            position += len(line)
            index += 1
            continue

        start = position
        fence_match = re.match(r"^\s{0,3}(```|~~~)", line)
        if fence_match:
            fence = fence_match.group(1)
            position += len(line)
            index += 1
            while index < len(lines):
                current = lines[index]
                position += len(current)
                index += 1
                if re.match(rf"^\s{{0,3}}{re.escape(fence)}\s*$", current):
                    break
            raw = text[start:position]
            blocks.append({"raw": raw, "start": start, "end": position, "kind": "code_fence"})
            continue

        if _markdown_heading_text(line):
            position += len(line)
            index += 1
            raw = text[start:position]
            blocks.append({"raw": raw, "start": start, "end": position, "kind": "heading"})
            continue

        while index < len(lines):
            current = lines[index]
            if not current.strip():
                break
            if position > start and (re.match(r"^\s{0,3}(```|~~~)", current) or _markdown_heading_text(current)):
                break
            position += len(current)
            index += 1

        raw = text[start:position]
        blocks.append({"raw": raw, "start": start, "end": position, "kind": _markdown_block_kind(raw)})

    return blocks


def _markdown_plain_text(raw: str) -> str:
    heading = _markdown_heading_text(raw)
    if heading is not None:
        return heading
    return re.sub(r"\s*\n\s*", " ", raw.strip()).strip()


def _is_markdown_protected_block(raw: str, kind: str, text: str) -> bool:
    stripped = raw.strip()
    if kind in {"code_fence", "heading", "rule", "blockquote", "table", "list", "html"}:
        return True
    if not stripped:
        return True
    if re.search(r"(^|\n)\s{4,}\S", raw):
        return True
    if re.search(r"(^|\n)\s{0,3}(!\[|\[.+?\]\(.+?\))", raw):
        return True
    if "`" in raw or "$$" in raw or "\\[" in raw or "\\]" in raw:
        return True
    if _looks_like_code_text(text) or _looks_like_formula_text(text) or _is_symbol_heavy_statement(text):
        return True
    return False


def _looks_like_markdown_body_paragraph(text: str) -> bool:
    compact = _compact_text(text)
    if len(compact) < 30:
        return False
    if _is_toc_entry(text) or _is_keyword_or_caption(text):
        return False
    if _excluded_section_from_heading_text(text) or _is_reference_entry(text):
        return False
    return len(compact) >= 50 or _looks_like_body_sentence(text)


def ingest_document(filename: str, content: bytes, mime_type: Optional[str] = None) -> IngestionResult:
    ext = validate_upload(filename, content)
    if ext == "docx":
        return ingest_docx(filename, content, mime_type)
    if ext == "pdf":
        return ingest_pdf(filename, content, mime_type)
    return ingest_markdown(filename, content, mime_type)


def ingest_markdown(filename: str, content: bytes, mime_type: Optional[str] = None) -> IngestionResult:
    text = _decode_text_content(content, "Markdown")

    text = text.strip()
    if not text:
        raise DocumentIngestionError("Markdown document is empty")

    markdown_blocks = _iter_markdown_blocks(text)
    blocks: List[DocumentBlock] = []
    text_parts: List[str] = []
    skipped_blocks = 0
    output_offset = 0
    current_section: Optional[str] = None
    seen_toc = False
    seen_abstract = False

    for block_index, block in enumerate(markdown_blocks):
        raw = block["raw"]
        kind = block["kind"]
        plain_text = _markdown_plain_text(raw)
        if not plain_text:
            continue

        heading_text = _markdown_heading_text(raw)
        section_hint = _section_from_heading_text(heading_text or plain_text)
        if section_hint:
            current_section = section_hint
            if section_hint == "abstract":
                seen_abstract = True
            elif section_hint == "excluded:toc":
                seen_toc = True
            skipped_blocks += 1
            continue

        if current_section == "excluded:toc" and kind == "heading" and not _is_toc_entry(plain_text):
            current_section = "body"
            skipped_blocks += 1
            continue

        if current_section == "excluded:toc" and kind != "heading" and _looks_like_markdown_body_paragraph(plain_text):
            current_section = "body"

        if current_section == "abstract" and seen_abstract and kind == "heading" and _is_body_heading_text(plain_text):
            current_section = "body"
            skipped_blocks += 1
            continue

        if current_section is None and seen_toc and kind != "heading" and _looks_like_markdown_body_paragraph(plain_text):
            current_section = "body"

        if current_section is None and kind == "paragraph" and _looks_like_markdown_body_paragraph(plain_text):
            current_section = "body"

        is_protected = _is_markdown_protected_block(raw, kind, plain_text)
        should_optimize = (
            current_section in {"abstract", "body", "acknowledgement"}
            and kind == "paragraph"
            and not is_protected
            and not _is_keyword_or_caption(plain_text)
            and not _is_reference_entry(plain_text)
        )

        if not should_optimize:
            skipped_blocks += 1
            continue

        separator_length = 2 if text_parts else 0
        output_offset += separator_length
        offset_start = output_offset
        offset_end = offset_start + len(plain_text)
        output_offset = offset_end
        text_parts.append(plain_text)

        blocks.append(
            DocumentBlock(
                block_id=f"markdown:block:{block_index}",
                text=plain_text,
                block_type=current_section or "markdown",
                block_index=len(blocks),
                offset_start=offset_start,
                offset_end=offset_end,
                structure_meta={
                    "block_index": block_index,
                    "markdown_kind": kind,
                    "source_offset_start": block["start"],
                    "source_offset_end": block["end"],
                    "section": current_section,
                    "preserve_markdown": True,
                },
            )
        )

    original_text = "\n\n".join(text_parts)
    if not original_text.strip():
        raise DocumentIngestionError("No optimizable Markdown body content was found. Headings, code, tables, formulas, table of contents, references, appendix, captions, and keywords are preserved.")

    counts = count_words(original_text)
    return IngestionResult(
        source_type="md",
        original_text=original_text,
        source_filename=filename,
        source_mime_type=mime_type,
        source_file_size=len(content),
        source_file_blob=text.encode("utf-8"),
        source_text_hash=hashlib.sha256(original_text.encode("utf-8")).hexdigest(),
        word_count=counts["word_count"],
        char_count=counts["char_count"],
        chinese_char_count=counts["chinese_char_count"],
        english_word_count=counts["english_word_count"],
        document_meta={
            "markdown_source_block_count": len(markdown_blocks),
            "markdown_block_count": len(blocks),
            "skipped_block_count": skipped_blocks,
            "editable_sections": ["abstract", "body", "acknowledgement"],
            "section_block_counts": {
                "abstract": sum(1 for block in blocks if block.block_type == "abstract"),
                "body": sum(1 for block in blocks if block.block_type == "body"),
                "acknowledgement": sum(1 for block in blocks if block.block_type == "acknowledgement"),
            },
            "preserved_content": ["headings", "toc", "references", "appendix", "captions", "keywords", "code", "tables", "formulas", "inline_code", "links", "images", "symbol_heavy_text"],
        },
        preserve_format_available=True,
        blocks=blocks,
    )


def ingest_docx(filename: str, content: bytes, mime_type: Optional[str] = None) -> IngestionResult:
    try:
        package = DocxPackage.from_bytes(content)
        root = package.read_xml("word/document.xml")
    except Exception as exc:
        raise DocumentIngestionError(f"鏃犳硶瑙ｆ瀽 docx 鏂囦欢: {exc}") from exc

    paragraphs = root.xpath(".//w:p", namespaces=NSMAP)
    style_names = _load_style_names(package)
    blocks: List[DocumentBlock] = []
    text_parts: List[str] = []
    skipped_blocks = 0
    offset = 0
    current_section: Optional[str] = None
    seen_toc = False
    seen_abstract = False
    seen_acknowledgement = False

    for paragraph_index, paragraph in enumerate(paragraphs):
        text_nodes = paragraph.xpath(".//w:t", namespaces=NSMAP)
        text = "".join(node.text or "" for node in text_nodes).strip()
        if not text:
            continue

        section_hint = _section_from_heading_text(text)
        is_heading = _is_heading_paragraph(paragraph, style_names, text)
        if section_hint:
            current_section = section_hint
            if section_hint == "abstract":
                seen_abstract = True
            elif section_hint == "acknowledgement":
                seen_acknowledgement = True
            elif section_hint == "excluded:toc":
                seen_toc = True
            skipped_blocks += 1
            continue

        if current_section == "excluded:toc" and is_heading and not _is_toc_entry(text):
            current_section = "body"
            skipped_blocks += 1
            continue

        if current_section == "excluded:toc" and not is_heading and _looks_like_body_paragraph(text, paragraph, style_names):
            current_section = "body"

        if current_section == "abstract" and seen_abstract and is_heading and _is_body_heading_text(text):
            current_section = "body"
            skipped_blocks += 1
            continue

        if current_section is None and seen_toc and not is_heading and _looks_like_body_paragraph(text, paragraph, style_names):
            current_section = "body"

        if _should_start_body_section(paragraph, style_names, text, is_heading, current_section):
            current_section = "body"

        in_table = bool(paragraph.xpath("ancestor::w:tc", namespaces=NSMAP))
        has_visual_object = _paragraph_has_visual_object(paragraph)
        has_equation = _paragraph_has_equation(paragraph)
        is_code_style = _is_code_style(paragraph, style_names)
        is_protected_technical = _is_protected_technical_paragraph(paragraph, style_names, text)
        should_optimize = (
            current_section in {"abstract", "body", "acknowledgement"}
            and not is_heading
            and (not in_table or _is_layout_table_paragraph(paragraph))
            and not has_visual_object
            and not has_equation
            and not is_code_style
            and not is_protected_technical
            and not _is_keyword_or_caption(text)
            and not _is_reference_entry(text)
        )

        if not should_optimize:
            skipped_blocks += 1
            continue

        block_type = "table_cell" if paragraph.xpath("ancestor::w:tc", namespaces=NSMAP) else current_section
        block_index = len(blocks)
        separator_length = 2 if text_parts else 0
        offset += separator_length
        offset_start = offset
        offset_end = offset_start + len(text)
        offset = offset_end
        text_parts.append(text)

        blocks.append(
            DocumentBlock(
                block_id=f"document:p:{paragraph_index}",
                text=text,
                block_type=block_type,
                block_index=block_index,
                offset_start=offset_start,
                offset_end=offset_end,
                structure_meta={
                    "part_name": "word/document.xml",
                    "paragraph_index": paragraph_index,
                    "text_node_count": len(text_nodes),
                    "section": current_section,
                    "style_id": _paragraph_style_id(paragraph),
                    "style_name": style_names.get(_paragraph_style_id(paragraph) or ""),
                    "is_body_style": _is_body_style(paragraph, style_names),
                    "has_equation": has_equation,
                    "is_code_style": is_code_style,
                    "is_protected_technical": is_protected_technical,
                },
            )
        )

    original_text = "\n\n".join(text_parts)
    if not original_text.strip():
        raise DocumentIngestionError("No optimizable Word body content was found. Headings, images, table of contents, references, appendix, captions, and keywords are preserved.")

    counts = count_words(original_text)
    return IngestionResult(
        source_type="docx",
        original_text=original_text,
        source_filename=filename,
        source_mime_type=mime_type,
        source_file_size=len(content),
        source_file_blob=content,
        source_text_hash=hashlib.sha256(original_text.encode("utf-8")).hexdigest(),
        word_count=counts["word_count"],
        char_count=counts["char_count"],
        chinese_char_count=counts["chinese_char_count"],
        english_word_count=counts["english_word_count"],
        document_meta={
            "paragraph_count": len(paragraphs),
            "text_block_count": len(blocks),
            "skipped_block_count": skipped_blocks,
            "editable_sections": ["abstract", "body", "acknowledgement"],
            "section_block_counts": {
                "abstract": sum(1 for block in blocks if block.block_type == "abstract"),
                "body": sum(1 for block in blocks if block.block_type == "body"),
                "acknowledgement": sum(1 for block in blocks if block.block_type == "acknowledgement"),
            },
            "body_style_block_count": sum(1 for block in blocks if block.structure_meta.get("is_body_style")),
            "preserved_content": ["headings", "images", "tables", "toc", "references", "appendix", "captions", "keywords", "equations", "code", "symbol_heavy_text"],
            "table_block_count": sum(1 for block in blocks if block.block_type == "table_cell"),
        },
        preserve_format_available=True,
        blocks=blocks,
    )


def ingest_pdf(filename: str, content: bytes, mime_type: Optional[str] = None) -> IngestionResult:
    try:
        import fitz
    except ImportError as exc:
        raise DocumentIngestionError("PDF parsing requires PyMuPDF") from exc

    try:
        doc = fitz.open(stream=content, filetype="pdf")
    except Exception as exc:
        raise DocumentIngestionError(f"Unable to parse PDF file: {exc}") from exc

    blocks: List[DocumentBlock] = []
    page_texts: List[str] = []
    offset = 0

    try:
        for page_index, page in enumerate(doc):
            page_text = page.get_text("text").strip()
            if not page_text:
                continue

            separator_length = 2 if page_texts else 0
            offset += separator_length
            offset_start = offset
            offset_end = offset_start + len(page_text)
            offset = offset_end
            page_texts.append(page_text)

            blocks.append(
                DocumentBlock(
                    block_id=f"pdf:page:{page_index}",
                    text=page_text,
                    block_type="page",
                    block_index=len(blocks),
                    offset_start=offset_start,
                    offset_end=offset_end,
                    structure_meta={"page_index": page_index},
                )
            )

        original_text = "\n\n".join(page_texts)
        if not original_text.strip():
            raise DocumentIngestionError("No editable text was extracted from the PDF; it may be scanned or image-based")

        counts = count_words(original_text)
        return IngestionResult(
            source_type="pdf",
            original_text=original_text,
            source_filename=filename,
            source_mime_type=mime_type,
            source_file_size=len(content),
            source_file_blob=None,
            source_text_hash=hashlib.sha256(original_text.encode("utf-8")).hexdigest(),
            word_count=counts["word_count"],
            char_count=counts["char_count"],
            chinese_char_count=counts["chinese_char_count"],
            english_word_count=counts["english_word_count"],
            document_meta={
                "page_count": doc.page_count,
                "text_page_count": len(blocks),
                "layout_preservation": "text_reflow",
            },
            preserve_format_available=False,
            blocks=blocks,
        )
    finally:
        doc.close()


def dumps_meta(meta: Dict[str, Any]) -> str:
    return json.dumps(meta, ensure_ascii=False)
