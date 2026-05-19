from __future__ import annotations

import json
from collections import defaultdict
from typing import Dict, Iterable, List, Tuple

from lxml import etree

from app.models.models import OptimizationSegment, OptimizationSession
from app.word_formatter.utils.ooxml import DocxPackage

W_NS = "http://schemas.openxmlformats.org/wordprocessingml/2006/main"
XML_NS = "http://www.w3.org/XML/1998/namespace"
NSMAP = {"w": W_NS}


def _final_segment_text(segment: OptimizationSegment) -> str:
    return segment.enhanced_text or segment.polished_text or segment.original_text or ""


def _set_text_node(node: etree._Element, text: str) -> None:
    node.text = text
    if text.startswith(" ") or text.endswith(" ") or "\n" in text:
        node.set(f"{{{XML_NS}}}space", "preserve")


def _replace_paragraph_text(paragraph: etree._Element, text: str) -> bool:
    text_nodes = paragraph.xpath(".//w:t", namespaces=NSMAP)
    if not text_nodes:
        return False

    _set_text_node(text_nodes[0], text)
    for node in text_nodes[1:]:
        _set_text_node(node, "")
    return True


def _group_segments_by_block(segments: Iterable[OptimizationSegment]) -> Dict[str, Tuple[OptimizationSegment, str]]:
    grouped: Dict[str, List[OptimizationSegment]] = defaultdict(list)
    for segment in segments:
        if segment.source_block_id:
            grouped[segment.source_block_id].append(segment)

    result: Dict[str, Tuple[OptimizationSegment, str]] = {}
    for block_id, block_segments in grouped.items():
        ordered = sorted(block_segments, key=lambda item: item.segment_index)
        result[block_id] = (ordered[0], "".join(_final_segment_text(item) for item in ordered))
    return result


def export_preserved_docx(session: OptimizationSession, segments: List[OptimizationSegment]) -> bytes:
    if not session.source_file_blob:
        raise ValueError("原始 Word 文件不存在，无法保留格式导出")

    package = DocxPackage.from_bytes(session.source_file_blob)
    grouped = _group_segments_by_block(segments)
    roots: Dict[str, etree._Element] = {}
    replaced_count = 0

    for _, (segment, final_text) in grouped.items():
        if not segment.structure_meta:
            continue

        try:
            meta = json.loads(segment.structure_meta)
        except json.JSONDecodeError:
            continue

        part_name = meta.get("part_name", "word/document.xml")
        paragraph_index = meta.get("paragraph_index")
        if paragraph_index is None:
            continue

        if part_name not in roots:
            roots[part_name] = package.read_xml(part_name)

        paragraphs = roots[part_name].xpath(".//w:p", namespaces=NSMAP)
        if paragraph_index >= len(paragraphs):
            continue

        if _replace_paragraph_text(paragraphs[paragraph_index], final_text):
            segment.replacement_strategy = "whole_paragraph"
            replaced_count += 1

    if replaced_count == 0:
        raise ValueError("未找到可替换的 Word 段落")

    for part_name, root in roots.items():
        package.write_xml(part_name, root)

    return package.to_bytes()
