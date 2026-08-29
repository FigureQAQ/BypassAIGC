import unittest

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


if __name__ == "__main__":
    unittest.main()
