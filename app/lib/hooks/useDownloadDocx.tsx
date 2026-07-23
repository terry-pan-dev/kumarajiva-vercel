import { Document, Paragraph, TextRun, HeadingLevel, Packer } from 'docx';

interface SectionInfo {
  documentTitle: string;
  sectionTitle: string | null;
}

// Only the fields the document actually renders — keeps the hook decoupled
// from any paragraph service shape.
interface DocxParagraph {
  origin: string;
  target: string | null;
}

export const useDownloadDocx = () => {
  const downloadDocx = async (
    paragraphs: DocxParagraph[],
    sectionInfo: SectionInfo,
    fileName: string = 'translation.docx',
  ) => {
    // Create new document
    const doc = new Document({
      sections: [
        {
          properties: {},
          children: [
            // Document Title as H1
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              alignment: 'center',
              spacing: {
                after: 400,
              },
              children: [
                new TextRun({
                  text: sectionInfo?.documentTitle || '',
                  bold: true,
                  size: 32,
                }),
              ],
            }),
            // Section Title as H2
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              alignment: 'center',
              spacing: {
                after: 800,
              },
              children: [
                new TextRun({
                  text: sectionInfo?.sectionTitle || '',
                  bold: true,
                  size: 28,
                }),
              ],
            }),
            // Content paragraphs
            ...paragraphs.flatMap((p) => [
              // Original text paragraph
              new Paragraph({
                children: [
                  new TextRun({
                    text: p.origin || '',
                  }),
                ],
              }),
              // Translation paragraph (if exists)
              ...(p.target
                ? [
                    new Paragraph({
                      children: [
                        new TextRun({
                          text: p.target,
                        }),
                      ],
                    }),
                  ]
                : []),
              // Add spacing between paragraph pairs
              new Paragraph({
                text: '',
                spacing: {
                  after: 400,
                },
              }),
            ]),
          ],
        },
      ],
    });

    // Generate blob from the document
    const blob = await Packer.toBlob(doc);

    // Create download link and trigger download
    const url = window.URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return { downloadDocx };
};
