import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ArrowUp,
  BotMessageSquare,
  ChevronRight,
  CornerDownRight,
  FileText,
  KeyRound,
  MessageCircle,
  QrCode,
  RotateCcw,
  Shield,
  ShoppingBag,
  Smartphone,
  Wallet,
  X,
  type LucideIcon,
} from 'lucide-react';
import type {
  AuthSession,
  HelpAssistantRole,
  HelpKbItem,
  HelpKbPayload,
} from '../../types';
import type { DocsPortalTheme } from '../../utils/docsConfig';
import {
  getCachedAdminWhatsAppPhone,
  getLocalHelpKbOrFallback,
  subscribeAdminWhatsAppPhone,
  subscribeHelpKb,
} from '../../utils/helpKbDb';
import {
  getQuickQuestionsForRole,
  getVisibleCategories,
  isItemVisibleForRole,
  searchHelpKb,
} from '../../utils/helpSearchEngine';
import { BrandText } from '../BrandText';

export interface SmartAssistantDrawerProps {
  theme: DocsPortalTheme;
  role: HelpAssistantRole;
  hasMobileBottomNav: boolean;
  session: AuthSession | null;
  onClose: () => void;
}

type ChatMessage =
  | { id: string; sender: 'user'; text: string }
  | {
      id: string;
      sender: 'assistant';
      kind: 'answer';
      item: HelpKbItem;
    }
  | {
      id: string;
      sender: 'assistant';
      kind: 'fallback';
      typedQuery: string;
      suggestions: HelpKbItem[];
    };

interface DrawerThemeStyle {
  cardSurface: string;
  headerSurface: string;
  orbClass: string;
  headingText: string;
  bodyText: string;
  mutedText: string;
  dotColor: string;
  badge: string;
  userBubble: string;
  accentButton: string;
  answerBubble: string;
  questionCard: string;
  chipButton: string;
  categoryActive: string;
  categoryIdle: string;
  dropdownSurface: string;
  pillInputWrapper: string;
  inputText: string;
  footerBorder: string;
  whatsappButton: string;
  iconButton: string;
}

const DRAWER_THEMES: Record<DocsPortalTheme, DrawerThemeStyle> = {
  plum: {
    cardSurface:
      'bg-[#FDFBF8]/[0.94] backdrop-blur-2xl border border-[#381932]/[0.16] shadow-[0_24px_60px_-14px_rgba(33,11,29,0.34)]',
    headerSurface:
      'bg-gradient-to-b from-[#381932]/[0.06] to-transparent border-b border-[#381932]/[0.10]',
    orbClass: 'glass-agent-plum text-[#FDFBF8]',
    headingText: 'text-[#210B1D]',
    bodyText: 'text-[#381932]',
    mutedText: 'text-[#381932]/70',
    dotColor: 'bg-[#381932]',
    badge:
      'bg-[#381932]/[0.08] text-[#210B1D] border border-[#381932]/[0.14]',
    userBubble: 'glass-plum text-[#FDFBF8]',
    accentButton: 'glass-agent-plum text-[#FDFBF8]',
    answerBubble:
      'bg-white/85 border border-[#381932]/[0.11] shadow-[0_6px_18px_-8px_rgba(56,25,50,0.16)]',
    questionCard:
      'bg-white/85 hover:bg-white border border-[#381932]/[0.12] shadow-sm',
    chipButton:
      'bg-white/85 hover:bg-white border border-[#381932]/[0.16] text-[#210B1D]',
    categoryActive: 'glass-plum text-[#FDFBF8]',
    categoryIdle:
      'bg-white/80 hover:bg-white border border-[#381932]/[0.14] text-[#381932]',
    dropdownSurface:
      'bg-[#FDFBF8]/[0.97] backdrop-blur-2xl border border-[#381932]/[0.16] shadow-xl',
    pillInputWrapper:
      'bg-white/95 border border-[#381932]/[0.18] focus-within:ring-2 focus-within:ring-[#381932]/20 focus-within:border-[#381932]/40 shadow-sm',
    inputText: 'text-[#210B1D] placeholder:text-[#381932]/45',
    footerBorder: 'border-t border-[#381932]/[0.10]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'bg-white/70 hover:bg-white border border-[#381932]/[0.10] text-[#381932]/85 hover:text-[#210B1D]',
  },
  forest: {
    cardSurface:
      'bg-[#F9FCF6]/[0.94] backdrop-blur-2xl border border-[#043326]/[0.16] shadow-[0_24px_60px_-14px_rgba(2,28,20,0.34)]',
    headerSurface:
      'bg-gradient-to-b from-[#043326]/[0.06] to-transparent border-b border-[#043326]/[0.10]',
    orbClass: 'glass-agent-forest text-[#F9FCF6]',
    headingText: 'text-[#021C14]',
    bodyText: 'text-[#043326]',
    mutedText: 'text-[#043326]/70',
    dotColor: 'bg-[#043326]',
    badge:
      'bg-[#043326]/[0.08] text-[#021C14] border border-[#043326]/[0.14]',
    userBubble: 'glass-forest text-[#F9FCF6]',
    accentButton: 'glass-agent-forest text-[#F9FCF6]',
    answerBubble:
      'bg-white/85 border border-[#043326]/[0.11] shadow-[0_6px_18px_-8px_rgba(4,51,38,0.16)]',
    questionCard:
      'bg-white/85 hover:bg-white border border-[#043326]/[0.12] shadow-sm',
    chipButton:
      'bg-white/85 hover:bg-white border border-[#043326]/[0.16] text-[#021C14]',
    categoryActive: 'glass-forest text-[#F9FCF6]',
    categoryIdle:
      'bg-white/80 hover:bg-white border border-[#043326]/[0.14] text-[#043326]',
    dropdownSurface:
      'bg-[#F9FCF6]/[0.97] backdrop-blur-2xl border border-[#043326]/[0.16] shadow-xl',
    pillInputWrapper:
      'bg-white/95 border border-[#043326]/[0.18] focus-within:ring-2 focus-within:ring-[#043326]/20 focus-within:border-[#043326]/40 shadow-sm',
    inputText: 'text-[#021C14] placeholder:text-[#043326]/45',
    footerBorder: 'border-t border-[#043326]/[0.10]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'bg-white/70 hover:bg-white border border-[#043326]/[0.10] text-[#043326]/85 hover:text-[#021C14]',
  },
  orange: {
    cardSurface:
      'bg-[#FDFDF1]/[0.95] backdrop-blur-2xl border border-[#EC5E27]/[0.22] shadow-[0_24px_60px_-14px_rgba(74,20,4,0.28)]',
    headerSurface:
      'bg-gradient-to-b from-[#EC5E27]/[0.08] to-transparent border-b border-[#EC5E27]/[0.14]',
    orbClass: 'glass-agent-orange text-[#FDFDF1]',
    headingText: 'text-[#4A1404]',
    bodyText: 'text-[#5C1B07]',
    mutedText: 'text-[#5C1B07]/70',
    dotColor: 'bg-[#EC5E27]',
    badge:
      'bg-[#EC5E27]/[0.12] text-[#4A1404] border border-[#EC5E27]/[0.20]',
    userBubble: 'glass-orange text-[#FDFDF1]',
    accentButton: 'glass-agent-orange text-[#FDFDF1]',
    answerBubble:
      'bg-white/90 border border-[#EC5E27]/[0.16] shadow-[0_6px_18px_-8px_rgba(92,27,7,0.14)]',
    questionCard:
      'bg-white/90 hover:bg-white border border-[#EC5E27]/[0.16] shadow-sm',
    chipButton:
      'bg-white/90 hover:bg-white border border-[#EC5E27]/[0.22] text-[#4A1404]',
    categoryActive: 'glass-orange text-[#FDFDF1]',
    categoryIdle:
      'bg-white/85 hover:bg-white border border-[#EC5E27]/[0.18] text-[#5C1B07]',
    dropdownSurface:
      'bg-[#FDFDF1]/[0.98] backdrop-blur-2xl border border-[#EC5E27]/[0.22] shadow-xl',
    pillInputWrapper:
      'bg-white/95 border border-[#EC5E27]/[0.22] focus-within:ring-2 focus-within:ring-[#EC5E27]/25 focus-within:border-[#EC5E27]/50 shadow-sm',
    inputText: 'text-[#4A1404] placeholder:text-[#5C1B07]/45',
    footerBorder: 'border-t border-[#EC5E27]/[0.14]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'bg-white/75 hover:bg-white border border-[#EC5E27]/[0.16] text-[#5C1B07]/85 hover:text-[#4A1404]',
  },
  public: {
    cardSurface:
      'bg-[#FFF8F6]/[0.94] backdrop-blur-2xl border border-[#5C0A0E]/[0.18] shadow-[0_24px_60px_-14px_rgba(43,4,6,0.34)]',
    headerSurface:
      'bg-gradient-to-b from-[#5C0A0E]/[0.07] to-transparent border-b border-[#5C0A0E]/[0.12]',
    orbClass: 'glass-agent-public text-white',
    headingText: 'text-[#2B0406]',
    bodyText: 'text-[#4A070A]',
    mutedText: 'text-[#7A2E33]',
    dotColor: 'bg-[#C40E16]',
    badge:
      'bg-[#5C0A0E]/[0.08] text-[#2B0406] border border-[#5C0A0E]/[0.15]',
    userBubble: 'glass-crimson text-white',
    accentButton: 'glass-agent-public text-white',
    answerBubble:
      'bg-white/88 border border-[#5C0A0E]/[0.12] shadow-[0_6px_18px_-8px_rgba(92,10,14,0.16)]',
    questionCard:
      'bg-white/88 hover:bg-white border border-[#5C0A0E]/[0.13] shadow-sm',
    chipButton:
      'bg-white/88 hover:bg-white border border-[#5C0A0E]/[0.16] text-[#2B0406]',
    categoryActive: 'glass-crimson text-white',
    categoryIdle:
      'bg-white/85 hover:bg-white border border-[#5C0A0E]/[0.14] text-[#4A070A]',
    dropdownSurface:
      'bg-[#FFF8F6]/[0.98] backdrop-blur-2xl border border-[#5C0A0E]/[0.16] shadow-xl',
    pillInputWrapper:
      'bg-white/95 border border-[#5C0A0E]/[0.18] focus-within:ring-2 focus-within:ring-[#5C0A0E]/20 focus-within:border-[#5C0A0E]/45 shadow-sm',
    inputText: 'text-[#2B0406] placeholder:text-[#7A2E33]/55',
    footerBorder: 'border-t border-[#5C0A0E]/[0.10]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'bg-white/75 hover:bg-white border border-[#5C0A0E]/[0.12] text-[#4A070A]/85 hover:text-[#2B0406]',
  },
};

const CATEGORY_ICONS: Record<string, LucideIcon> = {
  KeyRound,
  ShoppingBag,
  Wallet,
  QrCode,
  FileText,
  Shield,
  Smartphone,
};

const NATURAL_ADMIN_QUESTIONS: Record<string, string> = {
  auth_forgot_password:
    'അസ്സലാമു അലൈക്കും, എന്റെ പാസ്വേർഡ് മറന്നുപോയി, റീസെറ്റ് ചെയ്ത് കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  auth_login_failed:
    'അസ്സലാമു അലൈക്കും, എനിക്ക് ആപ്പിൽ ലോഗിൻ ചെയ്യാൻ പറ്റുന്നില്ല (Invalid എന്ന് കാണിക്കുന്നു). ഒന്ന് നോക്കി സഹായിക്കാമോ?',
  auth_first_login:
    'അസ്സലാമു അലൈക്കും, ആദ്യ ലോഗിനിൽ പുതിയ പാസ്വേർഡ് സെറ്റ് ചെയ്യാൻ പറ്റുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  auth_session_14days:
    'അസ്സലാമു അലൈക്കും, എന്റെ അക്കൗണ്ട് വീണ്ടും വീണ്ടും ലോഗ്ഔട്ട് ആകുന്നു. ഒന്ന് സഹായിക്കാമോ?',
  order_unit_add:
    'അസ്സലാമു അലൈക്കും, യൂണിറ്റ് പോർട്ടലിൽ പുതിയ ഓർഡർ ചേർക്കാൻ പറ്റുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  order_quantity_custom:
    'അസ്സലാമു അലൈക്കും, ഓർഡറിൽ കസ്റ്റം അളവ് (ലിറ്റർ) നൽകുന്നത് ശരിയാകുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  order_zero_minus:
    'അസ്സലാമു അലൈക്കും, ഓർഡറിലെ അളവ്/തുക ടൈപ്പ് ചെയ്യാൻ പറ്റുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  order_global_lock:
    'അസ്സലാമു അലൈക്കും, ഓർഡർ ക്ലോസ് (Orders Closed) എന്ന് കാണിക്കുന്നു; അത്യാവശ്യമായി ഒരു ഓർഡർ ചേർക്കാനുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  order_edit_delete:
    'അസ്സലാമു അലൈക്കും, തെറ്റായി ചേർത്ത ഒരു ഓർഡർ എഡിറ്റ്/ഡിലീറ്റ് ചെയ്യാനുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  pay_mandatory:
    'അസ്സലാമു അലൈക്കും, ഓർഡർ ചേർക്കുമ്പോൾ Paid/Unpaid സെലക്ട് ചെയ്ത് സേവ് ആകുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  pay_cash_upi:
    'അസ്സലാമു അലൈക്കും, Cash / UPI പേയ്മെന്റ് രീതിയിൽ ചെറിയൊരു സംശയമുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  pay_mark_as_paid:
    'അസ്സലാമു അലൈക്കും, Unpaid ആയ ഒരു ഓർഡർ Paid ആക്കി മാറ്റാൻ കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  code_find_unit_code:
    'അസ്സലാമു അലൈക്കും, എന്റെ യൂണിറ്റിന്റെ Public Order Code (WDR കോഡ്) കിട്ടുന്നില്ല. ഒന്ന് അയച്ചുതരാമോ?',
  code_public_order:
    'അസ്സലാമു അലൈക്കും, പബ്ലിക് പേജിലൂടെ ഓർഡർ ചേർക്കാൻ പറ്റുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  code_unit_isolation:
    'അസ്സലാമു അലൈക്കും, യൂണിറ്റ് കണക്കുകളും റാങ്കിംഗും കാണുന്നതിൽ ഒരു സംശയമുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  code_division_percent:
    'അസ്സലാമു അലൈക്കും, ഡാഷ്ബോർഡിലെ ശതമാനം (%) കണക്കിൽ ഒരു സംശയമുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  rep_whatsapp_receipt:
    'അസ്സലാമു അലൈക്കും, കസ്റ്റമർക്ക് WhatsApp രസീത് അയക്കാൻ കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  rep_pdf_csv:
    'അസ്സലാമു അലൈക്കും, വിതരണ ലിസ്റ്റ് (PDF / CSV) ഡൗൺലോഡ് ചെയ്യാൻ കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  rep_unpaid_list:
    'അസ്സലാമു അലൈക്കും, പണം തരാൻ ബാക്കിയുള്ളവരുടെ (Unpaid) ലിസ്റ്റ് എടുക്കാൻ കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  admin_direct_order:
    'അസ്സലാമു അലൈക്കും, Division Direct ഓർഡർ ചേർക്കുന്നതിൽ ഒരു സഹായം വേണം.',
  admin_reset_requests:
    'അസ്സലാമു അലൈക്കും, പാസ്വേർഡ് റീസെറ്റ് റിക്വസ്റ്റ് അപ്രൂവ് ചെയ്യുന്നതിൽ ഒരു സഹായം വേണം.',
  admin_settings_control:
    'അസ്സലാമു അലൈക്കും, ഡിവിഷൻ സെറ്റിംഗ്സ് (വില/ലിമിറ്റ്/ലോക്ക്) മാറ്റുന്നതിൽ ഒരു സഹായം വേണം.',
  sector_manage_units:
    'അസ്സലാമു അലൈക്കും, സെക്ടറിലെ യൂണിറ്റുകളെ മാനേജ് ചെയ്യുന്നതിൽ ഒരു സഹായം വേണം. ഒന്ന് സഹായിക്കാമോ?',
  tech_install_pwa:
    'അസ്സലാമു അലൈക്കും, ഫോണിൽ പായസം ആപ്പ് ഇൻസ്റ്റാൾ ചെയ്യാൻ കിട്ടുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
  tech_docs_reopen:
    'അസ്സലാമു അലൈക്കും, ആപ്പിന്റെ ഉപയോഗം സംബന്ധിച്ച് ഒരു സംശയമുണ്ട്. ഒന്ന് സഹായിക്കാമോ?',
  tech_refresh_issue:
    'അസ്സലാമു അലൈക്കും, ആപ്പിൽ കണക്കുകൾ അപ്ഡേറ്റ് ആകുന്നില്ല / പേജ് ലോഡ് ആകുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?',
};

function normalizeWhatsAppPhone(phone?: string): string {
  const digits = (phone ?? '').replace(/\D/g, '');
  if (!digits) return '';
  if (digits.length === 10) return `91${digits}`;
  if (digits.length === 11 && digits.startsWith('0')) {
    return `91${digits.slice(1)}`;
  }
  return digits;
}

function buildAdminWhatsAppUrl(
  adminPhone: string | undefined,
  session: AuthSession | null,
  context: { activeItem?: HelpKbItem; typedQuery?: string }
): string {
  let message: string;
  const { activeItem, typedQuery } = context;

  if (activeItem && NATURAL_ADMIN_QUESTIONS[activeItem.id]) {
    message = NATURAL_ADMIN_QUESTIONS[activeItem.id];
  } else if (activeItem) {
    message = `അസ്സലാമു അലൈക്കും, «${activeItem.question}» — ഇത് എനിക്ക് കിട്ടുന്നില്ല / ശരിയാകുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?`;
  } else if (typedQuery && typedQuery.trim()) {
    message = `അസ്സലാമു അലൈക്കും, SSF പായസം ആപ്പിൽ «${typedQuery.trim()}» — ഇത് എനിക്ക് കിട്ടുന്നില്ല / ശരിയാകുന്നില്ല. ഒന്ന് സഹായിക്കാമോ?`;
  } else {
    message =
      'അസ്സലാമു അലൈക്കും, SSF പായസം ആപ്പിൽ എനിക്ക് ഒരു സംശയമുണ്ട്, ഒന്ന് സഹായിക്കാമോ?';
  }

  if (session) {
    const sectorPart = session.sector_name ? `, ${session.sector_name}` : '';
    message += `\n— ${session.name} (${session.login_code})${sectorPart}`;
  }

  const encoded = encodeURIComponent(message);
  const cleanPhone = normalizeWhatsAppPhone(adminPhone);
  return cleanPhone
    ? `https://wa.me/${cleanPhone}?text=${encoded}`
    : `https://wa.me/?text=${encoded}`;
}

let msgCounter = 0;
function nextMsgId(prefix: string): string {
  msgCounter += 1;
  return `${prefix}_${Date.now()}_${msgCounter}`;
}

export function SmartAssistantDrawer({
  theme,
  role,
  hasMobileBottomNav,
  session,
  onClose,
}: SmartAssistantDrawerProps) {
  const styles = DRAWER_THEMES[theme];
  const [kb, setKb] = useState<HelpKbPayload | null>(null);
  const [selectedCategoryId, setSelectedCategoryId] = useState<string | null>(
    null
  );
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [query, setQuery] = useState('');
  const [lastTypedQuery, setLastTypedQuery] = useState('');
  const [cachedAdminPhone, setCachedAdminPhone] = useState<string>(() =>
    getCachedAdminWhatsAppPhone()
  );
  const [entered, setEntered] = useState(false);
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setEntered(true);
    });
    return () => window.cancelAnimationFrame(frame);
  }, []);

  useEffect(() => {
    let active = true;
    void getLocalHelpKbOrFallback().then((stored) => {
      if (active && stored?.payload) {
        setKb(stored.payload);
      }
    });
    const unsubscribe = subscribeHelpKb((updated) => {
      if (active && updated?.payload) {
        setKb(updated.payload);
      }
    });
    const unsubscribePhone = subscribeAdminWhatsAppPhone((phone) => {
      if (active) {
        setCachedAdminPhone(phone);
      }
    });
    return () => {
      active = false;
      unsubscribe();
      unsubscribePhone();
    };
  }, []);

  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  useEffect(() => {
    scrollEndRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, selectedCategoryId]);

  const itemById = useMemo(() => {
    const map = new Map<string, HelpKbItem>();
    if (!kb) return map;
    for (const item of kb.items) {
      map.set(item.id, item);
    }
    return map;
  }, [kb]);

  const visibleCategories = useMemo(
    () => (kb ? getVisibleCategories(kb, role) : []),
    [kb, role]
  );

  const quickQuestions = useMemo(
    () => (kb ? getQuickQuestionsForRole(kb, role, 4) : []),
    [kb, role]
  );

  const categoryQuestions = useMemo(() => {
    if (!kb || !selectedCategoryId) return [];
    return kb.items.filter(
      (item) =>
        item.category === selectedCategoryId &&
        isItemVisibleForRole(item, role)
    );
  }, [kb, selectedCategoryId, role]);

  const livePredictions = useMemo(() => {
    if (!kb || query.trim().length < 2) return [];
    return searchHelpKb(kb, query, role, 4);
  }, [kb, query, role]);

  const selectQuestion = useCallback(
    (item: HelpKbItem, userPromptOverride?: string) => {
      const userText = userPromptOverride?.trim() || item.question;
      setMessages((prev) => [
        ...prev,
        { id: nextMsgId('u'), sender: 'user', text: userText },
        { id: nextMsgId('a'), sender: 'assistant', kind: 'answer', item },
      ]);
      setQuery('');
      setSelectedCategoryId(null);
    },
    []
  );

  const handleResetHome = useCallback(() => {
    setMessages([]);
    setSelectedCategoryId(null);
    setQuery('');
    setLastTypedQuery('');
  }, []);

  const handleSubmit = (event: FormEvent) => {
    event.preventDefault();
    const trimmed = query.trim();
    if (!trimmed || !kb) return;

    setLastTypedQuery(trimmed);
    const results = searchHelpKb(kb, trimmed, role, 3);
    const topMatch = results[0];

    if (topMatch && topMatch.score >= 24) {
      selectQuestion(topMatch.item, trimmed);
      return;
    }

    setMessages((prev) => [
      ...prev,
      { id: nextMsgId('u'), sender: 'user', text: trimmed },
      {
        id: nextMsgId('f'),
        sender: 'assistant',
        kind: 'fallback',
        typedQuery: trimmed,
        suggestions: results.map((r) => r.item),
      },
    ]);
    setQuery('');
    setSelectedCategoryId(null);
  };

  const configuredAdminPhone =
    cachedAdminPhone ||
    kb?.admin_phone ||
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_ADMIN_WHATSAPP_PHONE) ||
    undefined;

  const latestWhatsAppContext = useMemo(() => {
    let activeItem: HelpKbItem | undefined;
    let typedQuery: string | undefined;

    for (let i = messages.length - 1; i >= 0; i -= 1) {
      const msg = messages[i];
      if (msg.sender === 'assistant') {
        if (msg.kind === 'answer') {
          activeItem = msg.item;
        } else if (msg.kind === 'fallback') {
          typedQuery = msg.typedQuery;
        }
        break;
      }
      if (!typedQuery) {
        typedQuery = msg.text;
      }
    }

    if (!activeItem && !typedQuery) {
      typedQuery = lastTypedQuery || query.trim() || undefined;
    }

    return { activeItem, typedQuery };
  }, [messages, lastTypedQuery, query]);

  const adminWhatsAppUrl = useMemo(
    () =>
      buildAdminWhatsAppUrl(
        configuredAdminPhone,
        session,
        latestWhatsAppContext
      ),
    [configuredAdminPhone, session, latestWhatsAppContext]
  );

  const drawerPositionClass = hasMobileBottomNav
    ? 'fixed inset-x-3 bottom-[calc(5.25rem+env(safe-area-inset-bottom,0px))] max-h-[72dvh] sm:inset-x-auto sm:right-6 sm:w-[376px] sm:max-w-[calc(100vw-2rem)] lg:bottom-[5.25rem] lg:max-h-[72vh] rounded-[26px] z-[55]'
    : 'fixed inset-x-3 bottom-4 max-h-[72dvh] sm:inset-x-auto sm:right-6 sm:bottom-[5.25rem] sm:w-[376px] sm:max-w-[calc(100vw-2rem)] sm:max-h-[72vh] rounded-[26px] z-[55]';

  return (
    <>
      <div
        className="sm:hidden fixed inset-0 z-[54] bg-black/20 backdrop-blur-[1px]"
        aria-hidden="true"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-label="സഹായി (Smart Help Assistant)"
        className={`${drawerPositionClass} ${styles.cardSurface} flex flex-col overflow-hidden transition-all duration-200 ease-out motion-reduce:transition-none ${
          entered
            ? 'opacity-100 translate-y-0 scale-100'
            : 'opacity-0 translate-y-3 scale-[0.98]'
        }`}
      >
        {/* Header */}
        <header
          className={`px-4 py-3 shrink-0 flex items-center justify-between gap-2.5 ${styles.headerSurface}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-9 h-9 rounded-2xl relative overflow-hidden ${styles.orbClass} flex items-center justify-center shrink-0`}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-[1px] rounded-2xl bg-gradient-to-b from-white/30 via-white/5 to-transparent"
              />
              <BotMessageSquare
                className="relative z-10 w-[18px] h-[18px]"
                strokeWidth={2.1}
              />
            </div>

            <div className="min-w-0">
              <div className="flex items-center gap-1.5">
                <h2
                  className={`font-ml text-[15px] font-bold leading-tight ${styles.headingText}`}
                >
                  സഹായി
                </h2>
                <span
                  className={`inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles.badge}`}
                >
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 shrink-0" />
                  <span>Offline</span>
                </span>
              </div>
              <p
                className={`text-[11px] font-medium truncate mt-0.5 ${styles.mutedText}`}
              >
                <span>Smart Help</span>
                {session && (
                  <>
                    <span> · </span>
                    <BrandText text={session.name} />
                  </>
                )}
              </p>
            </div>
          </div>

          <div className="flex items-center gap-1.5 shrink-0">
            {(messages.length > 0 || selectedCategoryId !== null) && (
              <button
                type="button"
                onClick={handleResetHome}
                aria-label="Reset assistant home"
                title="തുടക്കത്തിലേക്ക്"
                className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${styles.iconButton}`}
              >
                <RotateCcw className="w-3.5 h-3.5" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className={`w-8 h-8 rounded-full flex items-center justify-center transition-colors ${styles.iconButton}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">
          {!kb ? (
            <div
              className={`font-ml text-xs py-8 text-center ${styles.mutedText}`}
            >
              വിവരങ്ങൾ ലോഡ് ചെയ്യുന്നു...
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-3">
              <p
                className={`font-ml text-xs font-medium leading-relaxed ${styles.bodyText}`}
              >
                എന്താണ് അറിയേണ്ടത്? താഴെ തിരഞ്ഞെടുക്കുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യാം.
              </p>

              {/* Category Chips */}
              <div className="flex flex-wrap gap-1.5">
                {visibleCategories.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.icon] ?? BotMessageSquare;
                  const active = selectedCategoryId === cat.id;
                  return (
                    <button
                      key={cat.id}
                      type="button"
                      onClick={() =>
                        setSelectedCategoryId((prev) =>
                          prev === cat.id ? null : cat.id
                        )
                      }
                      className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full text-[11px] font-ml font-semibold transition-all duration-150 ${
                        active ? styles.categoryActive : styles.categoryIdle
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Quick or Selected Category Questions */}
              <div className="space-y-1.5">
                <p
                  className={`font-ml text-[11px] font-bold px-0.5 ${styles.mutedText}`}
                >
                  {selectedCategoryId
                    ? visibleCategories.find((c) => c.id === selectedCategoryId)
                        ?.label
                    : 'പ്രധാന ചോദ്യങ്ങൾ'}
                </p>

                {(selectedCategoryId ? categoryQuestions : quickQuestions).map(
                  (item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => selectQuestion(item)}
                      className={`group w-full text-left rounded-2xl px-3.5 py-2.5 flex items-center justify-between gap-2.5 transition-all duration-150 ${styles.questionCard}`}
                    >
                      <div className="flex items-start gap-2.5 min-w-0">
                        <span
                          className={`w-1.5 h-1.5 rounded-full shrink-0 mt-1.5 opacity-75 ${styles.dotColor}`}
                        />
                        <span
                          className={`font-ml text-[12.5px] font-semibold leading-snug ${styles.headingText}`}
                        >
                          {item.question}
                        </span>
                      </div>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 transition-transform duration-150 group-hover:translate-x-0.5 ${styles.mutedText}`}
                      />
                    </button>
                  )
                )}
              </div>

              <div className="pt-1 flex justify-center">
                <a
                  href={adminWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-ml text-[11px] font-semibold transition-opacity hover:opacity-90 ${styles.badge}`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>വേറെ സംശയമുണ്ടോ? അഡ്മിനോട് WhatsApp-ൽ ചോദിക്കാം</span>
                </a>
              </div>
            </div>
          ) : (
            <div className="space-y-3">
              {messages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        className={`max-w-[84%] rounded-2xl rounded-br-sm px-3.5 py-2 font-ml text-xs font-medium leading-snug ${styles.userBubble}`}
                      >
                        {msg.text}
                      </div>
                    </div>
                  );
                }

                if (msg.kind === 'answer') {
                  const followUpItems = msg.item.followUps
                    .map((fid) => itemById.get(fid))
                    .filter(
                      (fi): fi is HelpKbItem =>
                        Boolean(fi) && isItemVisibleForRole(fi!, role)
                    );

                  return (
                    <div key={msg.id} className="space-y-2">
                      <div className="flex items-start gap-2">
                        <div
                          className={`w-6 h-6 rounded-full relative overflow-hidden ${styles.orbClass} flex items-center justify-center shrink-0 mt-0.5`}
                        >
                          <BotMessageSquare className="w-3.5 h-3.5" />
                        </div>

                        <div
                          className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm p-3.5 space-y-2 ${styles.answerBubble}`}
                        >
                          <p
                            className={`font-ml text-[12.5px] font-bold leading-snug ${styles.headingText}`}
                          >
                            {msg.item.question}
                          </p>
                          <p
                            className={`font-ml text-[12.5px] leading-[1.75] ${styles.bodyText}`}
                          >
                            {msg.item.answer}
                          </p>
                          {msg.item.steps && msg.item.steps.length > 0 && (
                            <ol
                              className={`list-decimal list-inside space-y-1 font-ml text-xs ${styles.bodyText}`}
                            >
                              {msg.item.steps.map((step, sIdx) => (
                                <li key={sIdx}>{step}</li>
                              ))}
                            </ol>
                          )}
                        </div>
                      </div>

                      {followUpItems.length > 0 && (
                        <div className="pl-8 space-y-1.5">
                          <p
                            className={`font-ml text-[10px] font-bold ${styles.mutedText}`}
                          >
                            തുടർന്ന് ചോദിക്കാവുന്നവ
                          </p>
                          <div className="flex flex-wrap gap-1.5">
                            {followUpItems.map((fi) => (
                              <button
                                key={fi.id}
                                type="button"
                                onClick={() => selectQuestion(fi)}
                                className={`inline-flex items-center gap-1.5 text-left px-2.5 py-1.5 rounded-xl font-ml text-[11px] font-semibold transition-colors ${styles.chipButton}`}
                              >
                                <CornerDownRight className="w-3 h-3 shrink-0 opacity-65" />
                                <span>{fi.question}</span>
                              </button>
                            ))}
                          </div>
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div key={msg.id} className="flex items-start gap-2">
                    <div
                      className={`w-6 h-6 rounded-full relative overflow-hidden ${styles.orbClass} flex items-center justify-center shrink-0 mt-0.5`}
                    >
                      <BotMessageSquare className="w-3.5 h-3.5" />
                    </div>

                    <div
                      className={`flex-1 min-w-0 rounded-2xl rounded-tl-sm p-3.5 space-y-2.5 ${styles.answerBubble}`}
                    >
                      <p
                        className={`font-ml text-xs font-bold ${styles.headingText}`}
                      >
                        നേരിട്ടുള്ള ഉത്തരം കണ്ടെത്താനായില്ല.
                      </p>

                      {msg.suggestions.length > 0 && (
                        <div className="space-y-1.5">
                          <p
                            className={`font-ml text-[11px] font-semibold ${styles.mutedText}`}
                          >
                            ഇവയിലൊന്നാണോ ഉദ്ദേശിച്ചത്?
                          </p>
                          {msg.suggestions.map((sug) => (
                            <button
                              key={sug.id}
                              type="button"
                              onClick={() => selectQuestion(sug)}
                              className={`w-full text-left rounded-xl px-2.5 py-2 flex items-center justify-between gap-2 transition-colors ${styles.chipButton}`}
                            >
                              <span
                                className={`font-ml text-[11px] font-semibold leading-snug ${styles.headingText}`}
                              >
                                {sug.question}
                              </span>
                              <ChevronRight
                                className={`w-3.5 h-3.5 shrink-0 ${styles.mutedText}`}
                              />
                            </button>
                          ))}
                        </div>
                      )}

                      <a
                        href={adminWhatsAppUrl}
                        target="_blank"
                        rel="noopener noreferrer"
                        className={`w-full rounded-xl px-3 py-2 font-ml text-xs font-bold inline-flex items-center justify-center gap-1.5 transition-colors ${styles.whatsappButton}`}
                      >
                        <MessageCircle className="w-4 h-4 shrink-0" />
                        <span>
                          ഇത് കിട്ടുന്നില്ലേ? അഡ്മിനോട് WhatsApp-ൽ നേരിട്ട് ചോദിക്കാം
                        </span>
                      </a>
                    </div>
                  </div>
                );
              })}

              {/* Natural Context-Aware Footer WhatsApp Link */}
              <div className="pt-1 flex justify-center">
                <a
                  href={adminWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-ml text-[11px] font-semibold transition-opacity hover:opacity-90 ${styles.badge}`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>
                    ഇപ്പോഴും ശരിയായില്ലേ? അഡ്മിനോട് WhatsApp-ൽ ചോദിക്കാം
                  </span>
                </a>
              </div>
              <div ref={scrollEndRef} />
            </div>
          )}
        </div>

        {/* Modern Floating Pill Search Input + Live Autocomplete Predictions */}
        <div className={`relative px-3 pt-2.5 pb-3 shrink-0 ${styles.footerBorder}`}>
          {livePredictions.length > 0 && (
            <div
              role="listbox"
              aria-label="നിർദ്ദേശിച്ച ചോദ്യങ്ങൾ"
              className={`absolute left-3 right-3 bottom-full mb-2 rounded-2xl p-1.5 divide-y divide-black/5 z-10 ${styles.dropdownSurface}`}
            >
              {livePredictions.map((res) => (
                <button
                  key={res.item.id}
                  type="button"
                  onClick={() => selectQuestion(res.item)}
                  className="w-full text-left px-3 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors hover:bg-black/[0.04]"
                >
                  <span
                    className={`font-ml text-xs font-semibold leading-snug ${styles.headingText}`}
                  >
                    {res.item.question}
                  </span>
                  <ChevronRight
                    className={`w-3.5 h-3.5 shrink-0 ${styles.mutedText}`}
                  />
                </button>
              ))}
            </div>
          )}

          <form
            onSubmit={handleSubmit}
            className={`flex items-center gap-1.5 rounded-full pl-3.5 pr-1.5 py-1 transition-all ${styles.pillInputWrapper}`}
          >
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="സംശയം ടൈപ്പ് ചെയ്യുക (ഉദാ: password, unpaid, pdf)..."
              aria-label="Search help question"
              className={`flex-1 min-w-0 border-0 bg-transparent py-1 text-xs font-ml focus:ring-0 focus:outline-none ${styles.inputText}`}
            />
            <button
              type="submit"
              disabled={!query.trim() || !kb}
              aria-label="Submit help question"
              className={`h-8 w-8 rounded-full shrink-0 flex items-center justify-center transition-all disabled:opacity-40 hover:brightness-110 active:scale-95 ${styles.accentButton}`}
            >
              <ArrowUp className="w-4 h-4" strokeWidth={2.4} />
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

export default SmartAssistantDrawer;
