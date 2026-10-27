function extractEmailCoreBody(text) {
  if (!text) return '';
  let str = text.replace(/\r\n/g, '\n').replace(/\r/g, '\n');

  // Cut off quoted email chains
  const quoteSplitters = [
    /\n\s*from:\s+[^\n]+<[^\n]+>/i,
    /\n\s*from:\s+[^\n]+/i,
    /\n\s*de:\s+[^\n]+/i,
    /\n\s*on\s+.{5,100}\s+wrote:\s*$/im,
    /\n\s*el\s+.{5,100}\s+escribi[oó]:\s*$/im,
    /\n\s*-----original message-----/i,
    /\n\s*-----mensaje original-----/i,
    /\n\s*_{10,}/,
    /\n\s*-{10,}/,
  ];

  for (const splitter of quoteSplitters) {
    const idx = str.search(splitter);
    if (idx !== -1) {
      str = str.substring(0, idx);
    }
  }

  // Remove common disclaimers / security banners
  str = str.replace(/external email:?\s*be careful with links and attachments/gi, '');
  str = str.replace(/be careful with links and attachments/gi, '');

  // Cut off sign-offs & signatures
  const signOffSplitters = [
    /\n\s*(?:best regards|warm regards|kind regards|regards|sincerely|cheers)\b/i,
    /\n\s*(?:saludos cordiales|cordialmente|atentamente|saludos)\b/i,
  ];

  for (const splitter of signOffSplitters) {
    const idx = str.search(splitter);
    if (idx !== -1) {
      str = str.substring(0, idx);
    }
  }

  // Remove leading greetings (e.g. "Hi Vladimir,", "Hola Vladimir:", "Dear Vladimir,")
  str = str.replace(/^\s*(?:hi|hello|dear|hola|estimad[oa]|buen(?:os)?\s*d[ií]as?|buenas\s*tardes|buenas\s*noches)\s+[^\n,!:]{1,40}[,.:!]*\s*\n*/i, '');

  return str.trim();
}

const sampleEmail = `Hi Vladimir,

You welcome.

Best regards,

Cristhian Carpio, Freight Forwarder, Air Import, Miami, Air & Sea US

cristhian.carpio1@dsv.com<mailto:cristhian.carpio1@dsv.com>  |  Office +130547768005982  |  www.dsv.com<https://www.dsv.com/>

From: ACS <vladimir.lopez@advcomser.com>
Sent: Thursday, October 22, 2026 3:17 PM
To: Cristhian Carpio - DSV <cristhian.carpio1@dsv.com>
Subject: Re: RE: DSV Air & Sea, Inc. (EWR) Miami - - PTY0049679 - ADVANCE COMMERCIAL SERVICE INC.

External email:Be careful with links and attachments

Thanks Cristhian

 [Logo]

Vladimir Lopez
System Administrator
Phone: (305)906-8685
`;

console.log('Extracted Core Body:');
console.log(JSON.stringify(extractEmailCoreBody(sampleEmail)));
