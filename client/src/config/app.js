export const APP_CONFIG = {
  appName:  'NXT Sales',
  appShort: 'NXS',
  appColor: '#e63329',
  tagline:  'Sign in to your workspace',
  features: [
    'Manage contacts, leads & deals in one place',
    'Automate email campaigns & marketing workflows',
    'Track activities and close deals faster',
  ],
  suite: ['HR', 'LMS', 'Billing', 'Helpdesk', 'Assessment', 'NXT Sales'],
  suiteKey: 'NXT Sales',
  suiteLinks: {
    'HR':         'https://nxtpeople.altiusnxt.tech',
    'LMS':        'https://lms.altiusnxt.tech/login',
    'Billing':    'https://nxtbilling.altiusnxt.tech/login',
    'Helpdesk':   'https://tickets.altiusnxt.tech/login',
    'Assessment': 'https://assess.altiusnxt.tech',
    'NXT Sales':  '#',
  },
  auth: {
    password: true,
    otp:      false,
    google:   true,
  },
  supportEmail:       'it@altiusnxt.com',
  redirectAfterLogin: '/dashboard',
  forgotPasswordUrl:  '/forgot-password',
}
