import json
import unittest

from app.models.models import OptimizationSegment, OptimizationSession
from app.services.document_export_service import build_export
from app.services.document_ingestion_service import (
    DocumentIngestionError,
    ingest_document,
)


class TextDocumentIngestionTests(unittest.TestCase):
    def test_utf8_txt_is_ingested_as_editable_body(self):
        text = "这是一段 TXT 正文，用于验证中文编码和正文分段。"

        result = ingest_document("sample.txt", text.encode("utf-8"), "text/plain")

        self.assertEqual(result.source_type, "text")
        self.assertEqual(result.original_text, text)
        self.assertEqual(result.blocks[0].block_type, "body")
        self.assertFalse(result.preserve_format_available)

    def test_gb18030_txt_is_supported(self):
        text = "这是一段 GB18030 编码的 TXT 正文。"

        result = ingest_document("sample.txt", text.encode("gb18030"))

        self.assertEqual(result.original_text, text)
        self.assertEqual(result.source_mime_type, "text/plain")

    def test_empty_txt_is_rejected(self):
        with self.assertRaisesRegex(DocumentIngestionError, "TXT 文件没有可处理的正文内容"):
            ingest_document("empty.txt", b"\xef\xbb\xbf\r\n")


class MarkdownDocumentTests(unittest.TestCase):
    def export_markdown(self, source, replacements=()):
        ingestion = ingest_document("sample.md", source.encode("utf-8"))
        session = OptimizationSession(
            source_type=ingestion.source_type,
            source_filename=ingestion.source_filename,
            source_file_blob=ingestion.source_file_blob,
            preserve_format_available=ingestion.preserve_format_available,
        )
        segments = [
            OptimizationSegment(
                original_text=block.text,
                structure_meta=json.dumps(block.structure_meta),
            )
            for block in ingestion.blocks
        ]
        for segment, replacement in zip(segments, replacements):
            segment.polished_text = replacement
        return build_export(session, segments, "md").content.decode("utf-8")

    def test_unchanged_markdown_round_trips_exactly(self):
        source = (
            "\ufeff\r\n# Introduction\r\n\r\n"
            "  The original line wraps here\r\n  and continues here.\r\n\r\n"
        )
        flattened = "The original line wraps here and continues here."
        result = self.export_markdown(source, [flattened])
        self.assertEqual(result, source)

    def test_changed_markdown_preserves_surrounding_structure(self):
        source = (
            "\ufeff\r\n# Introduction\r\n\r\n"
            "  The first line of the paragraph.  \r\nAnother line.  \r\n\r\n"
            "> This blockquote should stay intact.\r\n\r\n"
            "This final paragraph has no newline."
        )
        result = self.export_markdown(source, ["A revised paragraph.\nA second line.", "The revised ending."])
        expected = (
            "\ufeff\r\n# Introduction\r\n\r\n"
            "  A revised paragraph.\r\nA second line.  \r\n\r\n"
            "> This blockquote should stay intact.\r\n\r\n"
            "The revised ending."
        )
        self.assertEqual(result, expected)

    def test_code_fence_requires_matching_marker_and_length(self):
        for marker in ("`", "~"):
            with self.subTest(marker=marker):
                other = "~" if marker == "`" else "`"
                code = (
                    f"  {marker * 4}python\n{marker * 3}\n{other * 5}\n"
                    "\nThis text belongs to the code block.\n"
                    f"   {marker * 5} \n"
                )
                source = f"# Introduction\n\n{code}\nThis prose follows the code block.\n"
                result = self.export_markdown(source, ["This prose was revised."])
                self.assertEqual(result, f"# Introduction\n\n{code}\nThis prose was revised.\n")


if __name__ == "__main__":
    unittest.main()
