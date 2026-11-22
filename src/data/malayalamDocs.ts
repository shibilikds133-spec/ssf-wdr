import {
  Award,
  BarChart3,
  Building2,
  CheckCircle2,
  Clock,
  Copy,
  Edit3,
  Eye,
  FileBarChart2,
  FileSpreadsheet,
  Filter,
  KeyRound,
  Layers,
  Lock,
  LogIn,
  MessageCircle,
  PlusCircle,
  Printer,
  QrCode,
  Search,
  Settings,
  ShieldCheck,
  SlidersHorizontal,
  Trophy,
  UserCheck,
  UserPlus,
  Wallet,
  type LucideIcon,
} from 'lucide-react';
import type { DocPageKey, DocsPortalTheme } from '../utils/docsConfig';

export {
  DOC_PAGE_THEMES,
  DOCS_SEEN_STORAGE_PREFIX,
  DOCS_THEME_STYLES,
  getDocsAccountScope,
  mergeSeenDocPageLists,
  normalizeDocPageKeys,
  readLocalSeenDocPages,
  writeLocalSeenDocPage,
  type DocPageKey,
  type DocsPortalTheme,
  type DocsThemeStyle,
} from '../utils/docsConfig';

export interface MalayalamDocPoint {
  title: string;
  description: string;
  icon: LucideIcon;
}

export interface MalayalamPageDoc {
  key: DocPageKey;
  theme: DocsPortalTheme;
  portalLabel: string;
  title: string;
  intro: string;
  points: MalayalamDocPoint[];
  tip?: string;
}

const REOPEN_DOCS_TIP =
  'ഈ ഗൈഡ് പിന്നീട് എപ്പോൾ വേണമെങ്കിലും മുകളിൽ വലതുവശത്തുള്ള ഡോക്സ് ഐക്കണിൽ ക്ലിക്ക് ചെയ്ത് വായിക്കാം.';

export const MALAYALAM_DOCS: Record<DocPageKey, MalayalamPageDoc> = {
  login: {
    key: 'login',
    theme: 'plum',
    portalLabel: 'Portal Login',
    title: 'പോർട്ടലിലേക്ക് എങ്ങനെ ലോഗിൻ ചെയ്യാം?',
    intro: 'നിങ്ങൾക്ക് ലഭിച്ച User ID-യും Password-ഉം താഴെ നൽകി ലോഗിൻ ചെയ്യുക.',
    points: [
      {
        title: 'User ID & Password',
        description:
          "ഡിവിഷനിൽ നിന്ന് ലഭിച്ച നിങ്ങളുടെ കൃത്യമായ User ID-യും പാസ്‌വേർഡും നൽകി 'Sign in' ക്ലിക്ക് ചെയ്യുക.",
        icon: UserCheck,
      },
      {
        title: 'ആദ്യ തവണ ലോഗിൻ ചെയ്യുമ്പോൾ',
        description:
          'സുരക്ഷയ്ക്കായി ആദ്യ ലോഗിനിൽ സ്വന്തമായി ഒരു പുതിയ പാസ്‌വേർഡ് സെറ്റ് ചെയ്യാൻ ആവശ്യപ്പെടും.',
        icon: ShieldCheck,
      },
      {
        title: '14 ദിവസം ലോഗിൻ നിലനിൽക്കും',
        description:
          'ഒരിക്കൽ ലോഗിൻ ചെയ്താൽ 14 ദിവസത്തേക്ക് വീണ്ടും പാസ്‌വേർഡ് അടിക്കേണ്ടതില്ല.',
        icon: Clock,
      },
      {
        title: 'പാസ്‌വേർഡ് മറന്നുപോയാൽ',
        description:
          "താഴെയുള്ള 'Forgot Password' വഴി നിങ്ങളുടെ User ID നൽകി പുതിയ പാസ്‌വേർഡിനായി റിക്വസ്റ്റ് ചെയ്യാം.",
        icon: KeyRound,
      },
    ],
  },

  setup_password: {
    key: 'setup_password',
    theme: 'plum',
    portalLabel: 'Security Setup',
    title: 'പുതിയ പാസ്‌വേർഡ് സെറ്റ് ചെയ്യാം',
    intro:
      'നിങ്ങളുടെ അക്കൗണ്ടിന്റെ സുരക്ഷയ്ക്കായി താൽക്കാലിക പാസ്‌വേർഡ് മാറ്റി സ്വന്തം പാസ്‌വേർഡ് നൽകുക.',
    points: [
      {
        title: 'സ്വന്തം പാസ്‌വേർഡ്',
        description:
          'ഓർമ്മയിൽ നിൽക്കുന്നതും സുരക്ഷിതവുമായ ഒരു പുതിയ പാസ്‌വേർഡ് രണ്ട് തവണ നൽകുക.',
        icon: Lock,
      },
      {
        title: 'User ID മാറ്റാം (ആവശ്യമെങ്കിൽ)',
        description:
          'ആവശ്യമെങ്കിൽ നിങ്ങൾക്ക് എളുപ്പമുള്ള User ID ഇവിടെ തിരുത്താനും സാധിക്കും.',
        icon: Edit3,
      },
      {
        title: 'നേരിട്ട് പോർട്ടലിലേക്ക്',
        description:
          'സേവ് ചെയ്താലുടൻ നിങ്ങളുടെ പോർട്ടൽ തുറന്നുവരും; തുടർന്നുള്ള 14 ദിവസം നേരിട്ട് കയറാൻ കഴിയും.',
        icon: LogIn,
      },
    ],
    tip: REOPEN_DOCS_TIP,
  },

  admin_dashboard: {
    key: 'admin_dashboard',
    theme: 'plum',
    portalLabel: 'Division Portal',
    title: 'ഡിവിഷൻ ഡാഷ്‌ബോർഡ്',
    intro:
      'ഡിവിഷന് കീഴിലുള്ള 8 സെക്ടറുകളുടെയും 92 യൂണിറ്റുകളുടെയും ആകെ പായസം ചലഞ്ച് കണക്കുകൾ ഇവിടെ തത്സമയം കാണാം.',
    points: [
      {
        title: 'ആകെ കണക്കുകളും ലിമിറ്റും',
        description:
          'ഡിവിഷനിൽ ആകെ ലഭിച്ച ലിറ്റർ, ആകെ തുക, ഡിവിഷൻ ലിമിറ്റിന്റെ എത്ര ശതമാനം എത്തി എന്നീ വിവരങ്ങൾ ഒറ്റനോട്ടത്തിൽ കാണാം.',
        icon: BarChart3,
      },
      {
        title: 'പേയ്‌മെന്റ് ബ്രേക്ക്ഡൗൺ',
        description:
          'Cash Handover, UPI, Unpaid (ബാക്കിയുള്ളത്) എന്നിവയുടെ കൃത്യമായ കണക്ക് പ്രത്യേകം കാണാം.',
        icon: Wallet,
      },
      {
        title: '+ Add Order (ഡിവിഷൻ ഓർഡർ)',
        description:
          'ഓർഡർ ക്ലോസ് ചെയ്ത ശേഷവും ഡിവിഷൻ അഡ്മിന് നേരിട്ട് (Division Direct) അല്ലെങ്കിൽ ഏതെങ്കിലും യൂണിറ്റിന്റെ പേരിൽ ഓർഡർ ചേർക്കാം.',
        icon: PlusCircle,
      },
      {
        title: 'ക്വിക്ക് എക്സ്പോർട്ട്',
        description:
          'മുകളിലെ Export ബട്ടൺ വഴി ഡിവിഷൻ, സെക്ടർ, അല്ലെങ്കിൽ യൂണിറ്റ് റിപ്പോർട്ടുകൾ PDF/CSV ആയി എടുക്കാം.',
        icon: FileBarChart2,
      },
    ],
    tip: REOPEN_DOCS_TIP,
  },

  admin_units: {
    key: 'admin_units',
    theme: 'plum',
    portalLabel: 'Division Portal',
    title: 'സെക്ടർ & യൂണിറ്റ് നിലവാരം',
    intro:
      'ഓരോ സെക്ടറിന്റെയും യൂണിറ്റിന്റെയും പ്രകടനവും ലിറ്റർ വിവരങ്ങളും ഇവിടെ താരതമ്യം ചെയ്ത് കാണാം.',
    points: [
      {
        title: 'സെക്ടർ ഫിൽറ്ററും സെർച്ചും',
        description:
          'ഏതെങ്കിലും ഒരു സെക്ടർ തിരഞ്ഞെടുത്തോ യൂണിറ്റ് പേര് സെർച്ച് ചെയ്തോ വേഗത്തിൽ കണക്ക് കണ്ടെത്താം.',
        icon: Search,
      },
      {
        title: 'റാങ്കിംഗും ശതമാനവും',
        description:
          'ഏറ്റവും കൂടുതൽ ഓർഡറുകൾ നേടിയ യൂണിറ്റുകളെയും സെക്ടറുകളെയും ക്രമമായി കാണാം.',
        icon: Trophy,
      },
      {
        title: 'ഒറ്റ ക്ലിക്കിൽ CSV',
        description:
          'ഈ ലിസ്റ്റ് നേരിട്ട് CSV ഫയലായി ഡൗൺലോഡ് ചെയ്ത് ഉപയോഗിക്കാം.',
        icon: FileSpreadsheet,
      },
    ],
  },

  admin_entries: {
    key: 'admin_entries',
    theme: 'plum',
    portalLabel: 'Division Portal',
    title: 'മുഴുവൻ ഓർഡറുകളുടെ പട്ടിക',
    intro:
      'ഡിവിഷനിൽ രേഖപ്പെടുത്തിയ ഓരോ കസ്റ്റമറുടെയും ഓർഡർ വിവരങ്ങൾ ഇവിടെ പരിശോധിക്കാനും നിയന്ത്രിക്കാനും സാധിക്കും.',
    points: [
      {
        title: 'വിപുലമായ ഫിൽറ്ററുകൾ',
        description:
          'സെക്ടർ, യൂണിറ്റ്, Division Direct, Paid / Unpaid, Cash / UPI എന്നിങ്ങനെ ആവശ്യമുള്ള ഓർഡറുകൾ മാത്രം വേർതിരിച്ച് കാണാം.',
        icon: Filter,
      },
      {
        title: 'Mark as Paid',
        description:
          'Unpaid ആയിട്ടുള്ള ഓർഡറുകളുടെ പണം ലഭിക്കുമ്പോൾ ഒറ്റ ക്ലിക്കിൽ Paid (Cash/UPI) ആക്കി മാറ്റാം.',
        icon: CheckCircle2,
      },
      {
        title: 'എഡിറ്റ് & ഡിലീറ്റ്',
        description:
          'ഏതെങ്കിലും ഓർഡറിൽ തെറ്റുണ്ടെങ്കിൽ തിരുത്താനും (Edit) ആവശ്യമില്ലാത്തത് നീക്കം ചെയ്യാനും സാധിക്കും.',
        icon: Edit3,
      },
      {
        title: 'WhatsApp രസീത്',
        description:
          'ഏത് ഓർഡറിന്റെയും രസീത് കസ്റ്റമർക്ക് ഒറ്റ ടാപ്പിൽ WhatsApp വഴി വീണ്ടും അയക്കാം.',
        icon: MessageCircle,
      },
    ],
  },

  admin_reports: {
    key: 'admin_reports',
    theme: 'plum',
    portalLabel: 'Division Portal',
    title: 'ഡിവിഷൻ റിപ്പോർട്ടുകൾ (PDF & CSV)',
    intro:
      'ഡിവിഷൻ, സെക്ടർ, യൂണിറ്റ് തലത്തിലുള്ള എല്ലാ ഔദ്യോഗിക റിപ്പോർട്ടുകളും ഇവിടെ നിന്ന് തയ്യാറാക്കി ഡൗൺലോഡ് ചെയ്യാം.',
    points: [
      {
        title: '4 തലത്തിലുള്ള റിപ്പോർട്ടുകൾ',
        description:
          'മുഴുവൻ ഡിവിഷൻ, ഏതെങ്കിലും ഒരു സെക്ടർ, ഒരു പ്രത്യേക യൂണിറ്റ്, അല്ലെങ്കിൽ Division Direct ഓർഡറുകൾ എന്നിവ വേർതിരിച്ച് എടുക്കാം.',
        icon: Layers,
      },
      {
        title: 'വിതരണ ഷീറ്റും Unpaid ലിസ്റ്റും',
        description:
          'പായസം വിതരണത്തിനുള്ള Tick-box Delivery Sheet-ഉം പണം കിട്ടാനുള്ളവരുടെ Unpaid ലിസ്റ്റും പ്രിന്റ് ചെയ്യാൻ പാകത്തിൽ PDF ആയി ലഭിക്കും.',
        icon: Printer,
      },
      {
        title: 'ലൈവ് പ്രിവ്യൂ',
        description:
          'ഡൗൺലോഡ് ചെയ്യുന്നതിന് മുൻപ് തന്നെ ഫിൽറ്റർ ചെയ്ത കണക്കുകൾ സ്ക്രീനിൽ പരിശോധിച്ച് ഉറപ്പുവരുത്താം.',
        icon: Eye,
      },
      {
        title: 'വൺ-ക്ലിക്ക് ഡയറക്ടറി',
        description:
          'താഴെയുള്ള ലിസ്റ്റിൽ നിന്ന് ഓരോ സെക്ടറിന്റെയും യൂണിറ്റിന്റെയും PDF/CSV ഒറ്റ ക്ലിക്കിൽ എടുക്കാം.',
        icon: FileBarChart2,
      },
    ],
  },

  admin_settings: {
    key: 'admin_settings',
    theme: 'plum',
    portalLabel: 'Division Portal',
    title: 'ഡിവിഷൻ സെറ്റിംഗ്സ് & പാസ്‌വേർഡ് ഹബ്',
    intro:
      'ചലഞ്ചിന്റെ വില, ലിമിറ്റ്, ഓർഡർ ലോക്ക്, യൂണിറ്റ്/സെക്ടർ പാസ്‌വേർഡുകൾ എന്നിവയെല്ലാം ഇവിടെ നിയന്ത്രിക്കാം.',
    points: [
      {
        title: 'ഓർഡർ ഓപ്പൺ / ക്ലോസ് (Global Lock)',
        description:
          'ഓർഡറുകൾ ക്ലോസ് ചെയ്താൽ പബ്ലിക് പേജിലും യൂണിറ്റ് പോർട്ടലിലും പുതിയ ഓർഡറുകൾ തൽക്ഷണം നിൽക്കും (ഡിവിഷൻ അഡ്മിന് മാത്രം തുടർന്നും ചേർക്കാം).',
        icon: Lock,
      },
      {
        title: 'ലിറ്റർ നിരക്കും ലിമിറ്റും',
        description:
          'ഒരു ലിറ്ററിന്റെ വിലയും (₹) ഡിവിഷൻ ടാർഗെറ്റ് ലിമിറ്റും ഇവിടെ അപ്ഡേറ്റ് ചെയ്യാം.',
        icon: Settings,
      },
      {
        title: 'പാസ്‌വേർഡ് റീസെറ്റ് റിക്വസ്റ്റുകൾ',
        description:
          'സെക്ടറുകളോ യൂണിറ്റുകളോ അയക്കുന്ന Forgot Password റിക്വസ്റ്റുകൾ ഇവിടെ കാണാനും, റീസെറ്റ് ചെയ്ത് പുതിയ ലിങ്ക് WhatsApp-ൽ അയക്കാനും സാധിക്കും.',
        icon: KeyRound,
      },
      {
        title: 'യൂണിറ്റ് & സെക്ടർ മാനേജ്‌മെന്റ്',
        description:
          'പുതിയ സെക്ടറുകളോ യൂണിറ്റുകളോ ചേർക്കാനും അവരുടെ ലോഗിൻ വിവരങ്ങൾ ഷെയർ ചെയ്യാനും കഴിയും.',
        icon: Building2,
      },
    ],
  },

  sector_dashboard: {
    key: 'sector_dashboard',
    theme: 'forest',
    portalLabel: 'Sector Portal',
    title: 'സെക്ടർ ഡാഷ്‌ബോർഡ്',
    intro:
      'നിങ്ങളുടെ സെക്ടറിന് കീഴിലുള്ള എല്ലാ യൂണിറ്റുകളുടെയും ആകെ പായസം ഓർഡറുകളും കണക്കുകളും ഇവിടെ തത്സമയം കാണാം.',
    points: [
      {
        title: 'സെക്ടർ സംഗ്രഹം',
        description:
          'സെക്ടറിലെ ആകെ ലിറ്റർ, ആകെ തുക, എത്ര യൂണിറ്റുകൾ സജീവമായി എന്നീ വിവരങ്ങൾ ആദ്യ സ്ക്രീനിൽ തന്നെ ലഭിക്കും.',
        icon: BarChart3,
      },
      {
        title: 'പേയ്‌മെന്റ് നില',
        description:
          'സെക്ടറിലെ Cash Handover, UPI, Unpaid (ബാക്കിയുള്ള തുക) എന്നിവ കൃത്യമായി വേർതിരിച്ച് കാണാം.',
        icon: Wallet,
      },
      {
        title: 'യൂണിറ്റ് പ്രകടന ചാർട്ട്',
        description:
          'നിങ്ങളുടെ സെക്ടറിൽ മുന്നിൽ നിൽക്കുന്ന യൂണിറ്റുകളെ ഗ്രാഫിലൂടെ എളുപ്പത്തിൽ തിരിച്ചറിയാം.',
        icon: Award,
      },
      {
        title: 'ക്വിക്ക് എക്സ്പോർട്ട്',
        description:
          'ഡാഷ്‌ബോർഡിലെ Export ബട്ടൺ വഴി സെക്ടറിന്റെയോ ഏതെങ്കിലും യൂണിറ്റിന്റെയോ PDF/CSV ഉടൻ എടുക്കാം.',
        icon: FileBarChart2,
      },
    ],
    tip: REOPEN_DOCS_TIP,
  },

  sector_units: {
    key: 'sector_units',
    theme: 'forest',
    portalLabel: 'Sector Portal',
    title: 'സെക്ടറിലെ യൂണിറ്റ് കണക്കുകൾ',
    intro:
      'നിങ്ങളുടെ സെക്ടറിലെ ഓരോ യൂണിറ്റും നേടിയ ലിറ്ററും തുകയും ഇവിടെ പ്രത്യേകം പരിശോധിക്കാം.',
    points: [
      {
        title: 'യൂണിറ്റ്-അടിസ്ഥാന നിലവാരം',
        description:
          'ഓരോ യൂണിറ്റിന്റെയും ഓർഡറുകളുടെ എണ്ണം, ആകെ ലിറ്റർ, സെക്ടറിലെ വിഹിതം (%) എന്നിവ കാണാം.',
        icon: Building2,
      },
      {
        title: 'സീറോ-ഓർഡർ യൂണിറ്റുകൾ',
        description:
          'ഇതുവരെ ഓർഡർ ചേർക്കാത്ത യൂണിറ്റുകളെയും വേഗത്തിൽ കണ്ടെത്തി ഫോളോ-അപ്പ് ചെയ്യാം.',
        icon: Clock,
      },
      {
        title: 'വേഗത്തിൽ സെർച്ച് ചെയ്യാം',
        description:
          'യൂണിറ്റ് പേരോ കോഡോ ടൈപ്പ് ചെയ്ത് ഏത് യൂണിറ്റിന്റെയും കണക്ക് ഉടൻ എടുക്കാം.',
        icon: Search,
      },
    ],
  },

  sector_orders: {
    key: 'sector_orders',
    theme: 'forest',
    portalLabel: 'Sector Portal',
    title: 'സെക്ടറിലെ മുഴുവൻ ഓർഡറുകൾ',
    intro:
      'നിങ്ങളുടെ സെക്ടറിലെ യൂണിറ്റുകളിൽ വന്ന ഓരോ ഓർഡറും ഇവിടെ പരിശോധിക്കാനും അപ്ഡേറ്റ് ചെയ്യാനും സാധിക്കും.',
    points: [
      {
        title: 'ഫിൽറ്റർ & സെർച്ച്',
        description:
          'കസ്റ്റമറുടെ പേര്, ഫോൺ നമ്പർ, യൂണിറ്റ്, Paid / Unpaid, Cash / UPI എന്നിവ പ്രകാരം ഫിൽറ്റർ ചെയ്യാം.',
        icon: Filter,
      },
      {
        title: 'Mark as Paid',
        description:
          'Unpaid ഓർഡറുകളുടെ തുക ലഭിച്ചാലുടൻ ഒറ്റ ക്ലിക്കിൽ Paid (Cash/UPI) ആക്കി മാറ്റാം.',
        icon: CheckCircle2,
      },
      {
        title: 'എഡിറ്റ് സൗകര്യം',
        description:
          'യൂണിറ്റ് ഓർഡറുകളിൽ എന്തെങ്കിലും തെറ്റുണ്ടെങ്കിൽ സെക്ടർ തലത്തിൽ തിരുത്താൻ സാധിക്കും.',
        icon: Edit3,
      },
      {
        title: 'WhatsApp രസീത്',
        description:
          'ഏത് ഓർഡറിന്റെയും രസീത് കസ്റ്റമർക്ക് WhatsApp വഴി വീണ്ടും അയക്കാം.',
        icon: MessageCircle,
      },
    ],
  },

  sector_reports: {
    key: 'sector_reports',
    theme: 'forest',
    portalLabel: 'Sector Portal',
    title: 'സെക്ടർ റിപ്പോർട്ടുകൾ (PDF & CSV)',
    intro:
      'സെക്ടർ മൊത്തമായോ ഓരോ യൂണിറ്റിന്റേത് വെവ്വേറെയോ PDF, CSV റിപ്പോർട്ടുകൾ ഇവിടെ നിന്ന് എടുക്കാം.',
    points: [
      {
        title: 'സെക്ടർ & യൂണിറ്റ് സ്കോപ്പ്',
        description:
          'സെക്ടർ മുഴുവനായോ, എല്ലാ യൂണിറ്റുകളുടെയും സമ്മറി ആയോ, ഏതെങ്കിലും ഒരു യൂണിറ്റിന്റേത് മാത്രമായോ തിരഞ്ഞെടുക്കാം.',
        icon: Layers,
      },
      {
        title: 'വിതരണ ലിസ്റ്റ് (Delivery Sheet)',
        description:
          'പായസം വിതരണ സമയത്ത് ടിക് ചെയ്യാൻ സൗകര്യമുള്ള പ്രിന്റ്-റെഡി PDF ഡൗൺലോഡ് ചെയ്യാം.',
        icon: Printer,
      },
      {
        title: 'Unpaid കളക്ഷൻ ഷീറ്റ്',
        description:
          'പണം പിരിക്കാൻ ബാക്കിയുള്ള ഓർഡറുകൾ മാത്രം ഒരു ലിസ്റ്റായി എടുക്കാം.',
        icon: Wallet,
      },
      {
        title: 'ഓരോ യൂണിറ്റിനും വൺ-ക്ലിക്ക് എക്സ്പോർട്ട്',
        description:
          'താഴെയുള്ള യൂണിറ്റ് ലിസ്റ്റിൽ നിന്ന് ഓരോ യൂണിറ്റിന്റെയും PDF/CSV ഒറ്റ ക്ലിക്കിൽ ഡൗൺലോഡ് ചെയ്യാം.',
        icon: FileBarChart2,
      },
    ],
  },

  sector_manage: {
    key: 'sector_manage',
    theme: 'forest',
    portalLabel: 'Sector Portal',
    title: 'യൂണിറ്റ് മാനേജ്‌മെന്റ്',
    intro:
      'നിങ്ങളുടെ സെക്ടറിന് കീഴിലുള്ള യൂണിറ്റുകളുടെ വിവരങ്ങളും കോൺടാക്റ്റ് നമ്പറുകളും ഇവിടെ കൈകാര്യം ചെയ്യാം.',
    points: [
      {
        title: 'യൂണിറ്റ് ചേർക്കാനും തിരുത്താനും',
        description:
          'പുതിയ യൂണിറ്റ് ചേർക്കാനോ നിലവിലുള്ള യൂണിറ്റിന്റെ പേരും ഫോൺ നമ്പറും അപ്ഡേറ്റ് ചെയ്യാനോ സാധിക്കും.',
        icon: UserPlus,
      },
      {
        title: 'ഓർഡർ കോഡുകൾ',
        description:
          'ഓരോ യൂണിറ്റിന്റെയും Public Order Code (WDR...) ഇവിടെ നിന്ന് എളുപ്പത്തിൽ കോപ്പി ചെയ്ത് നൽകാം.',
        icon: Copy,
      },
      {
        title: 'ലോഗിൻ വിവരങ്ങൾ',
        description:
          'യൂണിറ്റ് ഉത്തരവാദികൾക്ക് ലോഗിൻ ലിങ്കും വിവരങ്ങളും എളുപ്പത്തിൽ ഷെയർ ചെയ്യാൻ സാധിക്കും.',
        icon: SlidersHorizontal,
      },
    ],
  },

  unit_dashboard: {
    key: 'unit_dashboard',
    theme: 'orange',
    portalLabel: 'Unit Portal',
    title: 'യൂണിറ്റ് ഡാഷ്‌ബോർഡ്',
    intro:
      'നിങ്ങളുടെ യൂണിറ്റിന്റെ മാത്രം പായസം ഓർഡറുകളും കണക്കുകളും വേഗത്തിൽ നിയന്ത്രിക്കാനുള്ള ഹോം സ്ക്രീനാണിത്.',
    points: [
      {
        title: '+ Quick Order (നേരിട്ട് ഓർഡർ ചേർക്കാം)',
        description:
          'യൂണിറ്റ് കോഡോ ലിമിറ്റോ ഇല്ലാതെ ഒറ്റ ടാപ്പിൽ 1L, 2L, 3L, 5L, 10L ഓർഡറുകൾ ചേർക്കാം; Paid/Unpaid നിർബന്ധമായും തിരഞ്ഞെടുക്കണം.',
        icon: PlusCircle,
      },
      {
        title: 'Public Order Code കാർഡ്',
        description:
          'മുകളിൽ കാണുന്ന നിങ്ങളുടെ യൂണിറ്റ് കോഡ് (WDR...) കോപ്പി ചെയ്ത് പ്രവർത്തകർക്ക് നൽകിയാൽ അവർക്ക് പബ്ലിക് പേജിലൂടെയും ഓർഡർ എടുക്കാം.',
        icon: QrCode,
      },
      {
        title: 'കണക്കുകളും ഡിവിഷൻ വിഹിതവും',
        description:
          'നിങ്ങളുടെ യൂണിറ്റിലെ ആകെ ലിറ്റർ, തുക, ഡിവിഷൻ ലിമിറ്റിന്റെ എത്ര % നേടി, Cash / UPI / Unpaid കണക്ക് എന്നിവ ഇവിടെ കാണാം.',
        icon: BarChart3,
      },
      {
        title: 'WhatsApp രസീത് & എക്സ്പോർട്ട്',
        description:
          'ഓർഡർ ചേർത്താലുടൻ കസ്റ്റമർക്ക് WhatsApp രസീത് അയക്കാനും, Export വഴി PDF/CSV എടുക്കാനും സാധിക്കും.',
        icon: MessageCircle,
      },
    ],
    tip: REOPEN_DOCS_TIP,
  },

  unit_orders: {
    key: 'unit_orders',
    theme: 'orange',
    portalLabel: 'Unit Portal',
    title: 'യൂണിറ്റ് ഓർഡറുകളുടെ പട്ടിക',
    intro:
      'നിങ്ങളുടെ യൂണിറ്റിൽ രേഖപ്പെടുത്തിയ മുഴുവൻ കസ്റ്റമർ ഓർഡറുകളും ഇവിടെ കാണാനും ട്രാക്ക് ചെയ്യാനും സാധിക്കും.',
    points: [
      {
        title: 'വേഗത്തിൽ കണ്ടെത്താം',
        description:
          'കസ്റ്റമറുടെ പേരോ മൊബൈൽ നമ്പറോ സെർച്ച് ചെയ്തോ, Paid / Unpaid / Cash / UPI ഫിൽറ്ററുകൾ ഉപയോഗിച്ചോ ഓർഡറുകൾ തിരയാം.',
        icon: Search,
      },
      {
        title: 'Mark as Paid',
        description:
          'Unpaid ആയിരുന്ന കസ്റ്റമർ പണം നൽകുമ്പോൾ ഒറ്റ ക്ലിക്കിൽ Paid (Cash Handover / UPI) ആക്കി അപ്ഡേറ്റ് ചെയ്യാം.',
        icon: CheckCircle2,
      },
      {
        title: 'WhatsApp രസീത് വീണ്ടും അയക്കാം',
        description:
          'പഴയ ഏത് ഓർഡറിന്റെയും രസീത് ഒറ്റ ടാപ്പിൽ കസ്റ്റമർക്ക് WhatsApp ചെയ്യാം.',
        icon: MessageCircle,
      },
      {
        title: 'Delivery CSV',
        description:
          'വിതരണത്തിനുള്ള കസ്റ്റമർ ലിസ്റ്റ് വേഗത്തിൽ CSV ആയി ഡൗൺലോഡ് ചെയ്യാം.',
        icon: FileSpreadsheet,
      },
    ],
  },

  unit_reports: {
    key: 'unit_reports',
    theme: 'orange',
    portalLabel: 'Unit Portal',
    title: 'യൂണിറ്റ് റിപ്പോർട്ടുകൾ (PDF & CSV)',
    intro:
      'നിങ്ങളുടെ യൂണിറ്റിലെ പായസം വിതരണത്തിനും പണം കണക്കുതീർക്കാനുമുള്ള റിപ്പോർട്ടുകൾ ഇവിടെ നിന്ന് എടുക്കാം.',
    points: [
      {
        title: 'വിതരണ ഷീറ്റ് (Delivery Sheet)',
        description:
          'കസ്റ്റമറുടെ പേര്, ഫോൺ, ലിറ്റർ, പണം അടച്ചോ എന്നീ വിവരങ്ങളും ടിക് ബോക്സും അടങ്ങിയ പ്രിന്റ്-റെഡി PDF ലഭിക്കും.',
        icon: Printer,
      },
      {
        title: 'Unpaid കളക്ഷൻ ലിസ്റ്റ്',
        description:
          'പണം തരാൻ ബാക്കിയുള്ളവരുടെ മാത്രം പ്രത്യേക ലിസ്റ്റ് ഒറ്റ ക്ലിക്കിൽ എടുക്കാം.',
        icon: Wallet,
      },
      {
        title: 'Cash / UPI കണക്ക്',
        description:
          'കൈയ്യിൽ ലഭിച്ച പണവും UPI വഴി ലഭിച്ച തുകയും വേർതിരിച്ച് കൃത്യമായി ഒത്തുനോക്കാം.',
        icon: FileBarChart2,
      },
    ],
  },

  public_leaderboard: {
    key: 'public_leaderboard',
    theme: 'public',
    portalLabel: 'Live Public Portal',
    title: 'പാലട പായസം ചലഞ്ച് — ലൈവ് ലീഡർബോർഡ് & ക്വിക്ക് എൻട്രി',
    intro:
      'ലോഗിൻ ഇല്ലാതെ ഡിവിഷന്റെ ലൈവ് സ്കോർ കാണാനും, നിങ്ങളുടെ യൂണിറ്റ് കോഡ് ഉപയോഗിച്ച് സെക്കൻഡുകൾക്കുള്ളിൽ പുതിയ ഓർഡറുകൾ ചേർക്കാനും കഴിയും.',
    points: [
      {
        title: 'ലൈവ് സ്കോർബോർഡും റാങ്കിംഗും',
        description:
          'മുന്നിൽ നിൽക്കുന്ന സെക്ടറുകളെയും യൂണിറ്റുകളെയും ആകെ ലിറ്ററും തത്സമയം പരിശോധിക്കാം.',
        icon: Trophy,
      },
      {
        title: 'സ്മാർട്ട് ക്വിക്ക് എൻട്രി (സെക്ടർ → യൂണിറ്റ് → കോഡ്)',
        description:
          'ആദ്യം സെക്ടറും യൂണിറ്റും തിരഞ്ഞെടുത്താൽ 14 ദിവസത്തേക്ക് ഫോണിൽ ഓർമ്മിച്ചുവെക്കും; തുടർന്ന് യൂണിറ്റ് കോഡും കസ്റ്റമർ വിവരങ്ങളും മാത്രം നൽകിയാൽ മതി.',
        icon: QrCode,
      },
      {
        title: 'ഉടൻ WhatsApp രസീത്',
        description:
          'ഓർഡർ സേവ് ആയ ഉടൻ കസ്റ്റമർക്ക് Paid/Unpaid സ്റ്റാറ്റസ് സഹിതം WhatsApp രസീത് അയക്കാം.',
        icon: MessageCircle,
      },
      {
        title: 'ഭാരവാഹികൾക്കുള്ള പോർട്ടൽ ലോഗിൻ',
        description:
          'യൂണിറ്റ്, സെക്ടർ, ഡിവിഷൻ ഭാരവാഹികൾക്ക് മുകളിലെ Login ബട്ടൺ വഴി സ്വന്തം പോർട്ടലിലേക്ക് പ്രവേശിക്കാം.',
        icon: LogIn,
      },
    ],
    tip: REOPEN_DOCS_TIP,
  },
};
