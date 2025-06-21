import { Document, Paragraph, TextRun, HeadingLevel, Packer, AlignmentType } from 'docx';

import type { IParagraph } from '~/services/paragraph.service';

interface RollInfo {
  sutra: {
    title: string;
  };
  title: string;
}

export const useDownloadDocx = () => {
  const downloadDocx = async (
    paragraphs: Omit<IParagraph, 'references' | 'histories' | 'originComments' | 'targetComments'>[],
    rollInfo: RollInfo,
    fileName: string = 'translation.docx',
  ) => {
    // Create new document
    const doc = new Document({
      styles: {
        paragraphStyles: [
          {
            id: 'CenteredHeading1',
            name: 'Centered Heading 1',
            basedOn: 'Heading1',
            next: 'Normal',
            paragraph: {
              alignment: AlignmentType.CENTER,
            },
          },
          {
            id: 'CenteredHeading2',
            name: 'Centered Heading 2',
            basedOn: 'Heading2',
            next: 'Normal',
            paragraph: {
              alignment: AlignmentType.CENTER,
            },
          },
        ],
      },
      sections: [
        {
          children: [
            // Sutra Title as H1
            new Paragraph({
              heading: HeadingLevel.HEADING_1,
              style: 'CenteredHeading1',
              spacing: {
                after: 400,
              },
              children: [
                new TextRun({
                  text: rollInfo?.sutra.title || '',
                  bold: true,
                  size: 32,
                }),
              ],
            }),
            // Roll Title as H2
            new Paragraph({
              heading: HeadingLevel.HEADING_2,
              style: 'CenteredHeading2',
              spacing: {
                after: 400,
              },
              children: [
                new TextRun({
                  text: rollInfo?.title || '',
                  bold: true,
                  size: 28,
                }),
              ],
            }),
            // Content paragraphs
            ...paragraphs.flatMap((p) => [
              // Original text paragraph
              new Paragraph({
                alignment: 'left',
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
                      alignment: 'left',
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
                alignment: 'left',
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
    link.download = rollInfo.title || fileName;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    window.URL.revokeObjectURL(url);
  };

  return { downloadDocx };
};
