// @ts-check
// Note: type annotations allow type checking and IDEs autocompletion

/** @type {import('@docusaurus/types').Config} */
const config = {
  title: 'PDFweave',
  tagline: 'TypeScript PDF template engine with first-class data binding',
  url: 'https://idnteq.github.io',
  baseUrl: '/pdfweave/',
  onBrokenLinks: 'throw',
  favicon: 'favicon.ico',
  organizationName: 'IDNTEQ',
  projectName: 'pdfweave',
  deploymentBranch: 'website',
  trailingSlash: false,
  markdown: {
    hooks: {
      onBrokenMarkdownLinks: 'warn',
    },
  },
  i18n: {
    defaultLocale: 'en',
    locales: ['en', 'ja'],
    localeConfigs: {
      en: {
        label: 'English',
        direction: 'ltr',
      },
      ja: {
        label: '日本語',
        direction: 'ltr',
      },
    },
  },
  presets: [
    [
      'classic',
      /** @type {import('@docusaurus/preset-classic').Options} */
      {
        docs: {
          sidebarPath: require.resolve('./sidebars.js'),
          editUrl: 'https://github.com/IDNTEQ/pdfweave/tree/main/website/',
        },
        theme: {
          customCss: require.resolve('./src/css/custom.css'),
        },
        // Analytics tracking ID is upstream pdfme's — leave disabled until
        // PDFweave has its own GA property.
      },
    ],
  ],
  plugins: [
    [
      '@docusaurus/plugin-client-redirects',
      {
        redirects: [
          {
            to: '/docs/tables',
            from: '/docs/guides/tables',
          },
          {
            to: '/docs/custom-fonts',
            from: '/docs/guides/custom-fonts',
          },
          {
            to: '/docs/development-guide',
            from: '/development-guide',
          },
          {
            to: '/templates',
            from: '/demo'
          },
          {
            to: '/templates',
            from: '/demo/address-label-maker'
          },
          {
            to: '/templates',
            from: '/demo/barcode-qrcode-generator'
          },
          {
            to: '/templates',
            from: '/demo/free-invoice-generator'
          },
          {
            to: '/templates',
            from: '/demo/online-certificate-maker'
          }
        ],
      },
    ]
  ],
  themeConfig:
  /** @type {import('@docusaurus/preset-classic').ThemeConfig} */
  {
    image: 'img/ogimage.png',
    docs: {
      sidebar: {
        hideable: false,
      },
    },
    hideOnScroll: true,
    navbar: {
      title: 'PDFweave',
      items: [
        {
          type: 'doc',
          docId: 'getting-started',
          position: 'right',
          label: 'Docs',
        },
        {
          to: '/templates',
          position: 'right',
          label: 'Examples',
        },
        {
          to: '/template-design',
          position: 'right',
          label: 'Template Design',
        },
        {
          href: 'https://github.com/IDNTEQ/pdfweave',
          label: 'GitHub',
          position: 'right',
        },
        {
          type: 'localeDropdown',
          position: 'right',
        }
      ],
    },
    footer: {
      style: 'dark',
      links: [
        {
          title: 'Documentation',
          items: [
            {
              label: 'Getting Started',
              to: '/docs/getting-started',
            },
            {
              label: 'Supported Features',
              to: '/docs/supported-features',
            },
          ],
        },
        {
          title: 'More',
          items: [
            {
              label: 'Examples',
              to: '/templates',
            },
            {
              label: 'Template Design',
              to: '/template-design',
            },
          ],
        },
        {
          title: 'Community',
          items: [
            {
              label: 'GitHub',
              href: 'https://github.com/IDNTEQ/pdfweave',
            },
          ],
        },
      ],
      copyright: `Copyright © ${new Date().getFullYear()} IDNTEQ. PDFweave is MIT-licensed; built atop the work of pdfme contributors.`,
    },
    // Algolia search index is upstream pdfme's; disabled until PDFweave
    // has its own DocSearch index. Restore by re-adding the algolia block.
  },
};

module.exports = config;
