import dns from 'node:dns/promises';
import net from 'node:net';

export interface DiscoveredMailConfig {
  found: boolean;
  providerId: 'gmail' | 'outlook' | 'icloud' | 'custom_imap';
  providerName: string;
  imap_server: string;
  imap_port: number;
  smtp_server: string;
  smtp_port: number;
  use_ssl: boolean;
  discoveryMethod: 'dictionary' | 'mx_lookup' | 'ispdb' | 'socket_probe' | 'fallback';
  authUrl?: string;
  authButtonLabel?: string;
  authHint?: string;
}

// ---------------------------------------------------------------------------
// Tier 1: Known Domains Dictionary
// ---------------------------------------------------------------------------
const KNOWN_DOMAINS: Record<string, Omit<DiscoveredMailConfig, 'found' | 'discoveryMethod'>> = {
  // Google
  'gmail.com': {
    providerId: 'gmail',
    providerName: 'Google Mail',
    imap_server: 'imap.gmail.com',
    imap_port: 993,
    smtp_server: 'smtp.gmail.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://myaccount.google.com/apppasswords',
    authButtonLabel: 'Open Google to Generate Key',
    authHint:
      'Sign in to Google in the opened browser window, create an App Password named "Personal Assistant", and paste the 16-letter key below.',
  },
  'googlemail.com': {
    providerId: 'gmail',
    providerName: 'Google Mail',
    imap_server: 'imap.gmail.com',
    imap_port: 993,
    smtp_server: 'smtp.gmail.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://myaccount.google.com/apppasswords',
    authButtonLabel: 'Open Google to Generate Key',
    authHint:
      'Sign in to Google in the opened browser window, create an App Password named "Personal Assistant", and paste the 16-letter key below.',
  },

  // Microsoft
  'outlook.com': {
    providerId: 'outlook',
    providerName: 'Microsoft Outlook',
    imap_server: 'outlook.office365.com',
    imap_port: 993,
    smtp_server: 'smtp.office365.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.live.com/proofs/AppPassword',
    authButtonLabel: 'Open Microsoft Security in Browser',
    authHint:
      'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
  },
  'hotmail.com': {
    providerId: 'outlook',
    providerName: 'Microsoft Hotmail',
    imap_server: 'outlook.office365.com',
    imap_port: 993,
    smtp_server: 'smtp.office365.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.live.com/proofs/AppPassword',
    authButtonLabel: 'Open Microsoft Security in Browser',
    authHint:
      'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
  },
  'live.com': {
    providerId: 'outlook',
    providerName: 'Microsoft Live',
    imap_server: 'outlook.office365.com',
    imap_port: 993,
    smtp_server: 'smtp.office365.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.live.com/proofs/AppPassword',
    authButtonLabel: 'Open Microsoft Security in Browser',
    authHint:
      'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
  },
  'msn.com': {
    providerId: 'outlook',
    providerName: 'Microsoft MSN',
    imap_server: 'outlook.office365.com',
    imap_port: 993,
    smtp_server: 'smtp.office365.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.live.com/proofs/AppPassword',
    authButtonLabel: 'Open Microsoft Security in Browser',
    authHint:
      'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
  },
  'passport.com': {
    providerId: 'outlook',
    providerName: 'Microsoft Passport',
    imap_server: 'outlook.office365.com',
    imap_port: 993,
    smtp_server: 'smtp.office365.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.live.com/proofs/AppPassword',
    authButtonLabel: 'Open Microsoft Security in Browser',
    authHint:
      'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
  },

  // Apple iCloud
  'icloud.com': {
    providerId: 'icloud',
    providerName: 'Apple iCloud Mail',
    imap_server: 'imap.mail.me.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.me.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.apple.com/account/manage',
    authButtonLabel: 'Open Apple ID Portal in Browser',
    authHint:
      'Sign in to Apple ID -> App-Specific Passwords -> Generate a password and paste it below.',
  },
  'me.com': {
    providerId: 'icloud',
    providerName: 'Apple iCloud Mail',
    imap_server: 'imap.mail.me.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.me.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.apple.com/account/manage',
    authButtonLabel: 'Open Apple ID Portal in Browser',
    authHint:
      'Sign in to Apple ID -> App-Specific Passwords -> Generate a password and paste it below.',
  },
  'mac.com': {
    providerId: 'icloud',
    providerName: 'Apple iCloud Mail',
    imap_server: 'imap.mail.me.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.me.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://account.apple.com/account/manage',
    authButtonLabel: 'Open Apple ID Portal in Browser',
    authHint:
      'Sign in to Apple ID -> App-Specific Passwords -> Generate a password and paste it below.',
  },

  // Yahoo
  'yahoo.com': {
    providerId: 'custom_imap',
    providerName: 'Yahoo Mail',
    imap_server: 'imap.mail.yahoo.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.yahoo.com/account/security',
    authButtonLabel: 'Open Yahoo Security in Browser',
    authHint:
      'Sign in to Yahoo Security in your browser, generate an App Password, and paste it below.',
  },
  'yahoo.co.uk': {
    providerId: 'custom_imap',
    providerName: 'Yahoo Mail UK',
    imap_server: 'imap.mail.yahoo.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.yahoo.com/account/security',
    authButtonLabel: 'Open Yahoo Security in Browser',
    authHint:
      'Sign in to Yahoo Security in your browser, generate an App Password, and paste it below.',
  },
  'yahoo.ca': {
    providerId: 'custom_imap',
    providerName: 'Yahoo Mail CA',
    imap_server: 'imap.mail.yahoo.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.yahoo.com/account/security',
    authButtonLabel: 'Open Yahoo Security in Browser',
    authHint:
      'Sign in to Yahoo Security in your browser, generate an App Password, and paste it below.',
  },
  'ymail.com': {
    providerId: 'custom_imap',
    providerName: 'Yahoo Mail',
    imap_server: 'imap.mail.yahoo.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.yahoo.com/account/security',
    authButtonLabel: 'Open Yahoo Security in Browser',
    authHint:
      'Sign in to Yahoo Security in your browser, generate an App Password, and paste it below.',
  },
  'rocketmail.com': {
    providerId: 'custom_imap',
    providerName: 'Yahoo RocketMail',
    imap_server: 'imap.mail.yahoo.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.yahoo.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.yahoo.com/account/security',
    authButtonLabel: 'Open Yahoo Security in Browser',
    authHint:
      'Sign in to Yahoo Security in your browser, generate an App Password, and paste it below.',
  },

  // AOL
  'aol.com': {
    providerId: 'custom_imap',
    providerName: 'AOL Mail',
    imap_server: 'imap.aol.com',
    imap_port: 993,
    smtp_server: 'smtp.aol.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://login.aol.com/account/security',
    authButtonLabel: 'Open AOL Security in Browser',
    authHint:
      'Sign in to AOL Security in your browser, generate an App Password, and paste it below.',
  },

  // Zoho
  'zoho.com': {
    providerId: 'custom_imap',
    providerName: 'Zoho Mail',
    imap_server: 'imap.zoho.com',
    imap_port: 993,
    smtp_server: 'smtp.zoho.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://accounts.zoho.com/home#security/app_password',
    authButtonLabel: 'Open Zoho Security in Browser',
    authHint: 'Create an Application-Specific Password in Zoho Accounts and paste it below.',
  },
  'zohomail.com': {
    providerId: 'custom_imap',
    providerName: 'Zoho Mail',
    imap_server: 'imap.zoho.com',
    imap_port: 993,
    smtp_server: 'smtp.zoho.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://accounts.zoho.com/home#security/app_password',
    authButtonLabel: 'Open Zoho Security in Browser',
    authHint: 'Create an Application-Specific Password in Zoho Accounts and paste it below.',
  },

  // Fastmail
  'fastmail.com': {
    providerId: 'custom_imap',
    providerName: 'Fastmail',
    imap_server: 'imap.fastmail.com',
    imap_port: 993,
    smtp_server: 'smtp.fastmail.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://app.fastmail.com/settings/security/devicekeys',
    authButtonLabel: 'Open Fastmail in Browser',
    authHint: 'Generate a new App Password (or App Key) in Fastmail Settings and paste it below.',
  },
  'fastmail.fm': {
    providerId: 'custom_imap',
    providerName: 'Fastmail',
    imap_server: 'imap.fastmail.com',
    imap_port: 993,
    smtp_server: 'smtp.fastmail.com',
    smtp_port: 587,
    use_ssl: true,
    authUrl: 'https://app.fastmail.com/settings/security/devicekeys',
    authButtonLabel: 'Open Fastmail in Browser',
    authHint: 'Generate a new App Password (or App Key) in Fastmail Settings and paste it below.',
  },

  // GMX & Mail.com
  'gmx.com': {
    providerId: 'custom_imap',
    providerName: 'GMX Mail',
    imap_server: 'imap.gmx.com',
    imap_port: 993,
    smtp_server: 'mail.gmx.com',
    smtp_port: 587,
    use_ssl: true,
  },
  'gmx.net': {
    providerId: 'custom_imap',
    providerName: 'GMX Mail',
    imap_server: 'imap.gmx.net',
    imap_port: 993,
    smtp_server: 'mail.gmx.net',
    smtp_port: 587,
    use_ssl: true,
  },
  'gmx.de': {
    providerId: 'custom_imap',
    providerName: 'GMX Mail (DE)',
    imap_server: 'imap.gmx.net',
    imap_port: 993,
    smtp_server: 'mail.gmx.net',
    smtp_port: 587,
    use_ssl: true,
  },
  'mail.com': {
    providerId: 'custom_imap',
    providerName: 'Mail.com',
    imap_server: 'imap.mail.com',
    imap_port: 993,
    smtp_server: 'smtp.mail.com',
    smtp_port: 587,
    use_ssl: true,
  },

  // Yandex
  'yandex.com': {
    providerId: 'custom_imap',
    providerName: 'Yandex Mail',
    imap_server: 'imap.yandex.com',
    imap_port: 993,
    smtp_server: 'smtp.yandex.com',
    smtp_port: 465,
    use_ssl: true,
  },
  'yandex.ru': {
    providerId: 'custom_imap',
    providerName: 'Yandex Mail',
    imap_server: 'imap.yandex.ru',
    imap_port: 993,
    smtp_server: 'smtp.yandex.ru',
    smtp_port: 465,
    use_ssl: true,
  },
  'ya.ru': {
    providerId: 'custom_imap',
    providerName: 'Yandex Mail',
    imap_server: 'imap.yandex.ru',
    imap_port: 993,
    smtp_server: 'smtp.yandex.ru',
    smtp_port: 465,
    use_ssl: true,
  },

  // Proton Mail Bridge
  'proton.me': {
    providerId: 'custom_imap',
    providerName: 'Proton Mail (Bridge)',
    imap_server: '127.0.0.1',
    imap_port: 1143,
    smtp_server: '127.0.0.1',
    smtp_port: 1025,
    use_ssl: false,
    authHint: 'Requires Proton Mail Bridge running locally on your computer.',
  },
  'protonmail.com': {
    providerId: 'custom_imap',
    providerName: 'Proton Mail (Bridge)',
    imap_server: '127.0.0.1',
    imap_port: 1143,
    smtp_server: '127.0.0.1',
    smtp_port: 1025,
    use_ssl: false,
    authHint: 'Requires Proton Mail Bridge running locally on your computer.',
  },
  'pm.me': {
    providerId: 'custom_imap',
    providerName: 'Proton Mail (Bridge)',
    imap_server: '127.0.0.1',
    imap_port: 1143,
    smtp_server: '127.0.0.1',
    smtp_port: 1025,
    use_ssl: false,
    authHint: 'Requires Proton Mail Bridge running locally on your computer.',
  },
};

// ---------------------------------------------------------------------------
// Tier 2: DNS MX Record Matching
// ---------------------------------------------------------------------------
async function resolveMxWithTimeout(domain: string, timeoutMs = 3500) {
  return Promise.race([
    dns.resolveMx(domain),
    new Promise<never>((_, reject) =>
      setTimeout(() => reject(new Error('DNS MX query timeout')), timeoutMs)
    ),
  ]);
}

function matchMxConfig(exchanges: string[], domain: string): DiscoveredMailConfig | null {
  for (const ex of exchanges) {
    const exchange = ex.toLowerCase();

    // Google Workspace
    if (exchange.includes('google.com') || exchange.includes('googlemail.com')) {
      return {
        found: true,
        providerId: 'gmail',
        providerName: 'Google Workspace',
        imap_server: 'imap.gmail.com',
        imap_port: 993,
        smtp_server: 'smtp.gmail.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://myaccount.google.com/apppasswords',
        authButtonLabel: 'Open Google to Generate Key',
        authHint:
          'Sign in to Google in the opened browser window, create an App Password named "Personal Assistant", and paste the 16-letter key below.',
      };
    }

    // Microsoft 365 / Outlook
    if (exchange.includes('outlook.com') || exchange.includes('protection.outlook.com')) {
      return {
        found: true,
        providerId: 'outlook',
        providerName: 'Microsoft 365',
        imap_server: 'outlook.office365.com',
        imap_port: 993,
        smtp_server: 'smtp.office365.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://account.live.com/proofs/AppPassword',
        authButtonLabel: 'Open Microsoft Security in Browser',
        authHint:
          'Sign in to Microsoft in your browser to create an App Password (or use your account password if 2FA is off), then paste it below.',
      };
    }

    // Zoho
    if (exchange.includes('zoho.com') || exchange.includes('zoho.eu') || exchange.includes('zoho.in')) {
      const isEu = exchange.includes('zoho.eu');
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Zoho Mail',
        imap_server: isEu ? 'imap.zoho.eu' : 'imap.zoho.com',
        imap_port: 993,
        smtp_server: isEu ? 'smtp.zoho.eu' : 'smtp.zoho.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://accounts.zoho.com/home#security/app_password',
        authButtonLabel: 'Open Zoho Security in Browser',
        authHint: 'Create an Application-Specific Password in Zoho Accounts and paste it below.',
      };
    }

    // GoDaddy
    if (exchange.includes('secureserver.net')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'GoDaddy Mail',
        imap_server: 'imap.secureserver.net',
        imap_port: 993,
        smtp_server: 'smtpout.secureserver.net',
        smtp_port: 465,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Namecheap PrivateEmail
    if (exchange.includes('privateemail.com')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Namecheap PrivateEmail',
        imap_server: 'mail.privateemail.com',
        imap_port: 993,
        smtp_server: 'mail.privateemail.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Titan Mail
    if (exchange.includes('titan.email')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Titan Mail',
        imap_server: 'imap.titan.email',
        imap_port: 993,
        smtp_server: 'smtp.titan.email',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Hostinger
    if (exchange.includes('hostinger.com')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Hostinger Mail',
        imap_server: 'imap.hostinger.com',
        imap_port: 993,
        smtp_server: 'smtp.hostinger.com',
        smtp_port: 465,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Rackspace
    if (exchange.includes('emailsrvr.com')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Rackspace Email',
        imap_server: 'secure.emailsrvr.com',
        imap_port: 993,
        smtp_server: 'secure.emailsrvr.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // IONOS / 1&1
    if (exchange.includes('ionos.com') || exchange.includes('1and1.com') || exchange.includes('perfora.net')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'IONOS Mail',
        imap_server: 'imap.ionos.com',
        imap_port: 993,
        smtp_server: 'smtp.ionos.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Migadu
    if (exchange.includes('migadu.com')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Migadu',
        imap_server: 'imap.migadu.com',
        imap_port: 993,
        smtp_server: 'smtp.migadu.com',
        smtp_port: 465,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
      };
    }

    // Fastmail
    if (exchange.includes('fastmail.com') || exchange.includes('messagingengine.com')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Fastmail',
        imap_server: 'imap.fastmail.com',
        imap_port: 993,
        smtp_server: 'smtp.fastmail.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://app.fastmail.com/settings/security/devicekeys',
        authButtonLabel: 'Open Fastmail in Browser',
        authHint: 'Generate a new App Password (or App Key) in Fastmail Settings and paste it below.',
      };
    }

    // Yahoo Business
    if (exchange.includes('yahoodns.net')) {
      return {
        found: true,
        providerId: 'custom_imap',
        providerName: 'Yahoo Business Mail',
        imap_server: 'imap.mail.yahoo.com',
        imap_port: 993,
        smtp_server: 'smtp.mail.yahoo.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://login.yahoo.com/account/security',
      };
    }

    // Apple iCloud Custom Domain
    if (exchange.includes('icloud.com')) {
      return {
        found: true,
        providerId: 'icloud',
        providerName: 'iCloud (Custom Domain)',
        imap_server: 'imap.mail.me.com',
        imap_port: 993,
        smtp_server: 'smtp.mail.me.com',
        smtp_port: 587,
        use_ssl: true,
        discoveryMethod: 'mx_lookup',
        authUrl: 'https://account.apple.com/account/manage',
        authButtonLabel: 'Open Apple ID Portal in Browser',
        authHint:
          'Sign in to Apple ID -> App-Specific Passwords -> Generate a password and paste it below.',
      };
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tier 3: Mozilla Thunderbird ISPDB Lookup
// ---------------------------------------------------------------------------
function parseIspdbXml(xml: string, domain: string): DiscoveredMailConfig | null {
  try {
    const imapMatch = xml.match(/<incomingServer\s+type=["']imap["']>([\s\S]*?)<\/incomingServer>/i);
    if (!imapMatch) return null;

    const imapBlock = imapMatch[1];
    const imapHostMatch = imapBlock.match(/<hostname>([^<]+)<\/hostname>/i);
    const imapPortMatch = imapBlock.match(/<port>(\d+)<\/port>/i);
    const imapSocketMatch = imapBlock.match(/<socketType>([^<]+)<\/socketType>/i);

    if (!imapHostMatch) return null;

    const imap_server = imapHostMatch[1].trim();
    const imap_port = imapPortMatch ? parseInt(imapPortMatch[1], 10) : 993;
    const imapSocket = imapSocketMatch ? imapSocketMatch[1].trim().toUpperCase() : 'SSL';

    let smtp_server = `smtp.${domain}`;
    let smtp_port = 587;
    const smtpMatch = xml.match(/<outgoingServer\s+type=["']smtp["']>([\s\S]*?)<\/outgoingServer>/i);
    if (smtpMatch) {
      const smtpBlock = smtpMatch[1];
      const smtpHostMatch = smtpBlock.match(/<hostname>([^<]+)<\/hostname>/i);
      const smtpPortMatch = smtpBlock.match(/<port>(\d+)<\/port>/i);
      if (smtpHostMatch) smtp_server = smtpHostMatch[1].trim();
      if (smtpPortMatch) smtp_port = parseInt(smtpPortMatch[1], 10);
    }

    const nameMatch =
      xml.match(/<displayName>([^<]+)<\/displayName>/i) ||
      xml.match(/<displayShortName>([^<]+)<\/displayShortName>/i);
    const providerName = nameMatch ? nameMatch[1].trim() : `${domain} Mail`;

    return {
      found: true,
      providerId: 'custom_imap',
      providerName,
      imap_server,
      imap_port,
      smtp_server,
      smtp_port,
      use_ssl: imapSocket === 'SSL' || imap_port === 993 || imapSocket === 'STARTTLS',
      discoveryMethod: 'ispdb',
    };
  } catch {
    return null;
  }
}

async function fetchIspdbConfig(domain: string): Promise<DiscoveredMailConfig | null> {
  const urls = [
    `https://autoconfig.thunderbird.net/v1.1/${domain}`,
    `https://autoconfig.${domain}/mail/config-v1.1.xml`,
  ];

  for (const url of urls) {
    try {
      const res = await fetch(url, {
        signal: AbortSignal.timeout(3500),
        headers: { Accept: 'application/xml, text/xml' },
      });
      if (res.ok) {
        const text = await res.text();
        const parsed = parseIspdbXml(text, domain);
        if (parsed) return parsed;
      }
    } catch {
      // Continue to next URL
    }
  }

  return null;
}

// ---------------------------------------------------------------------------
// Tier 4: Live TCP Socket Port Probing
// ---------------------------------------------------------------------------
function probePort(host: string, port: number, timeoutMs = 1500): Promise<boolean> {
  return new Promise((resolve) => {
    const socket = new net.Socket();
    let isSettled = false;

    const cleanup = () => {
      if (!isSettled) {
        isSettled = true;
        socket.destroy();
      }
    };

    socket.setTimeout(timeoutMs);
    socket.once('connect', () => {
      cleanup();
      resolve(true);
    });
    socket.once('timeout', () => {
      cleanup();
      resolve(false);
    });
    socket.once('error', () => {
      cleanup();
      resolve(false);
    });

    try {
      socket.connect(port, host);
    } catch {
      cleanup();
      resolve(false);
    }
  });
}

async function probeFirstResponsiveHost(
  candidates: { host: string; port: number }[],
  timeoutMs = 1500
): Promise<{ host: string; port: number } | null> {
  const results = await Promise.all(
    candidates.map(async (c) => ({
      candidate: c,
      open: await probePort(c.host, c.port, timeoutMs),
    }))
  );

  const matched = results.find((r) => r.open);
  return matched ? matched.candidate : null;
}

async function probeMailServers(domain: string): Promise<DiscoveredMailConfig | null> {
  const imapCandidates = [
    { host: `imap.${domain}`, port: 993 },
    { host: `mail.${domain}`, port: 993 },
    { host: domain, port: 993 },
  ];

  const smtpCandidates = [
    { host: `smtp.${domain}`, port: 587 },
    { host: `smtp.${domain}`, port: 465 },
    { host: `mail.${domain}`, port: 587 },
    { host: `mail.${domain}`, port: 465 },
    { host: domain, port: 587 },
  ];

  const responsiveImap = await probeFirstResponsiveHost(imapCandidates, 1500);
  if (!responsiveImap) {
    return null;
  }

  const responsiveSmtp = await probeFirstResponsiveHost(smtpCandidates, 1500);

  return {
    found: true,
    providerId: 'custom_imap',
    providerName: `Custom Mail (${domain})`,
    imap_server: responsiveImap.host,
    imap_port: responsiveImap.port,
    smtp_server: responsiveSmtp ? responsiveSmtp.host : `smtp.${domain}`,
    smtp_port: responsiveSmtp ? responsiveSmtp.port : 587,
    use_ssl: true,
    discoveryMethod: 'socket_probe',
  };
}

// ---------------------------------------------------------------------------
// Primary Autodiscover Pipeline
// ---------------------------------------------------------------------------
export async function autodiscoverMailConfig(emailOrDomain: string): Promise<DiscoveredMailConfig> {
  const rawInput = (emailOrDomain || '').trim().toLowerCase();
  const domain = rawInput.includes('@') ? rawInput.split('@').pop() || '' : rawInput;

  if (!domain || !domain.includes('.')) {
    return {
      found: false,
      providerId: 'custom_imap',
      providerName: 'Custom IMAP',
      imap_server: '',
      imap_port: 993,
      smtp_server: '',
      smtp_port: 587,
      use_ssl: true,
      discoveryMethod: 'fallback',
    };
  }

  // Tier 1: Known domain dictionary
  if (KNOWN_DOMAINS[domain]) {
    const config = KNOWN_DOMAINS[domain];
    return {
      ...config,
      found: true,
      discoveryMethod: 'dictionary',
    };
  }

  // Tier 2: DNS MX Record Inspection
  try {
    const mxRecords = await resolveMxWithTimeout(domain, 3500);
    if (Array.isArray(mxRecords) && mxRecords.length > 0) {
      // Sort by priority ascending
      const sorted = [...mxRecords].sort((a, b) => a.priority - b.priority);
      const mxExchanges = sorted.map((r) => r.exchange);
      const matched = matchMxConfig(mxExchanges, domain);
      if (matched) {
        return matched;
      }
    }
  } catch {
    // MX lookup failed or timed out; proceed to Tier 3
  }

  // Tier 3: Mozilla Thunderbird ISPDB Lookup
  try {
    const ispdbConfig = await fetchIspdbConfig(domain);
    if (ispdbConfig) {
      return ispdbConfig;
    }
  } catch {
    // ISPDB failed; proceed to Tier 4
  }

  // Tier 4: Live TCP Socket Port Probing
  try {
    const probeConfig = await probeMailServers(domain);
    if (probeConfig) {
      return probeConfig;
    }
  } catch {
    // Probing failed; proceed to fallback
  }

  // Fallback
  return {
    found: false,
    providerId: 'custom_imap',
    providerName: 'Custom IMAP',
    imap_server: `imap.${domain}`,
    imap_port: 993,
    smtp_server: `smtp.${domain}`,
    smtp_port: 587,
    use_ssl: true,
    discoveryMethod: 'fallback',
  };
}
