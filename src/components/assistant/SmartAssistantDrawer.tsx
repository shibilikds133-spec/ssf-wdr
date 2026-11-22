import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type FormEvent,
} from 'react';
import {
  ChevronRight,
  FileText,
  Home,
  KeyRound,
  MessageCircle,
  QrCode,
  Send,
  Shield,
  ShoppingBag,
  Smartphone,
  Sparkles,
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
  getLocalHelpKbOrFallback,
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
  headingText: string;
  bodyText: string;
  mutedText: string;
  badge: string;
  accentBg: string;
  headerBorder: string;
  answerBubble: string;
  chipButton: string;
  categoryActive: string;
  categoryIdle: string;
  dropdownSurface: string;
  inputClass: string;
  whatsappButton: string;
  iconButton: string;
}

const DRAWER_THEMES: Record<DocsPortalTheme, DrawerThemeStyle> = {
  plum: {
    cardSurface:
      'bg-[#FDFBF8]/[0.94] backdrop-blur-xl border border-[#381932]/[0.18] shadow-2xl',
    headingText: 'text-[#210B1D]',
    bodyText: 'text-[#381932]',
    mutedText: 'text-[#381932]/75',
    badge:
      'bg-[#381932]/[0.08] text-[#210B1D] border border-[#381932]/[0.15]',
    accentBg: 'bg-[#381932] text-[#FDFBF8] hover:bg-[#210B1D]',
    headerBorder: 'border-b border-[#381932]/[0.10]',
    answerBubble: 'bg-white/85 border border-[#381932]/[0.12]',
    chipButton:
      'bg-white/85 hover:bg-white border border-[#381932]/[0.16] text-[#210B1D]',
    categoryActive: 'bg-[#381932] text-[#FDFBF8] border border-[#381932]',
    categoryIdle:
      'bg-white/80 hover:bg-white border border-[#381932]/[0.14] text-[#381932]',
    dropdownSurface:
      'bg-[#FDFBF8]/[0.98] backdrop-blur-xl border border-[#381932]/[0.18] shadow-lg',
    inputClass:
      'bg-white/90 border border-[#381932]/[0.20] text-[#210B1D] placeholder:text-[#381932]/50 focus:ring-2 focus:ring-[#381932]/20 focus:border-[#381932]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'text-[#381932]/80 hover:text-[#210B1D] hover:bg-[#381932]/[0.08]',
  },
  forest: {
    cardSurface:
      'bg-[#F9FCF6]/[0.94] backdrop-blur-xl border border-[#043326]/[0.18] shadow-2xl',
    headingText: 'text-[#021C14]',
    bodyText: 'text-[#043326]',
    mutedText: 'text-[#043326]/75',
    badge:
      'bg-[#043326]/[0.08] text-[#021C14] border border-[#043326]/[0.15]',
    accentBg: 'bg-[#043326] text-[#F9FCF6] hover:bg-[#021C14]',
    headerBorder: 'border-b border-[#043326]/[0.10]',
    answerBubble: 'bg-white/85 border border-[#043326]/[0.12]',
    chipButton:
      'bg-white/85 hover:bg-white border border-[#043326]/[0.16] text-[#021C14]',
    categoryActive: 'bg-[#043326] text-[#F9FCF6] border border-[#043326]',
    categoryIdle:
      'bg-white/80 hover:bg-white border border-[#043326]/[0.14] text-[#043326]',
    dropdownSurface:
      'bg-[#F9FCF6]/[0.98] backdrop-blur-xl border border-[#043326]/[0.18] shadow-lg',
    inputClass:
      'bg-white/90 border border-[#043326]/[0.20] text-[#021C14] placeholder:text-[#043326]/50 focus:ring-2 focus:ring-[#043326]/20 focus:border-[#043326]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'text-[#043326]/80 hover:text-[#021C14] hover:bg-[#043326]/[0.08]',
  },
  orange: {
    cardSurface:
      'bg-[#FDFDF1]/[0.95] backdrop-blur-xl border border-[#EC5E27]/[0.24] shadow-2xl',
    headingText: 'text-[#4A1404]',
    bodyText: 'text-[#5C1B07]',
    mutedText: 'text-[#5C1B07]/75',
    badge:
      'bg-[#EC5E27]/[0.12] text-[#4A1404] border border-[#EC5E27]/[0.22]',
    accentBg: 'bg-[#EC5E27] text-[#FDFDF1] hover:bg-[#D44B1A]',
    headerBorder: 'border-b border-[#EC5E27]/[0.14]',
    answerBubble: 'bg-white/90 border border-[#EC5E27]/[0.16]',
    chipButton:
      'bg-white/90 hover:bg-white border border-[#EC5E27]/[0.22] text-[#4A1404]',
    categoryActive: 'bg-[#EC5E27] text-[#FDFDF1] border border-[#EC5E27]',
    categoryIdle:
      'bg-white/85 hover:bg-white border border-[#EC5E27]/[0.18] text-[#5C1B07]',
    dropdownSurface:
      'bg-[#FDFDF1]/[0.98] backdrop-blur-xl border border-[#EC5E27]/[0.24] shadow-lg',
    inputClass:
      'bg-white/95 border border-[#EC5E27]/[0.24] text-[#4A1404] placeholder:text-[#5C1B07]/50 focus:ring-2 focus:ring-[#EC5E27]/25 focus:border-[#EC5E27]',
    whatsappButton:
      'bg-emerald-700 hover:bg-emerald-800 text-white shadow-sm',
    iconButton:
      'text-[#5C1B07]/80 hover:text-[#4A1404] hover:bg-[#EC5E27]/[0.10]',
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
  role: HelpAssistantRole,
  session: AuthSession | null,
  queryText: string
): string {
  const lines = ['*SSF Wandoor Payasam — Help Request*', `Portal: ${role}`];
  if (session) {
    lines.push(`Account: ${session.name} (${session.login_code})`);
    if (session.sector_name) {
      lines.push(`Sector: ${session.sector_name}`);
    }
  }
  if (queryText.trim()) {
    lines.push(`Question: ${queryText.trim()}`);
  }

  const encoded = encodeURIComponent(lines.join('\n'));
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
  const scrollEndRef = useRef<HTMLDivElement | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

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
    return () => {
      active = false;
      unsubscribe();
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
    (typeof import.meta !== 'undefined' &&
      import.meta.env?.VITE_ADMIN_WHATSAPP_PHONE) ||
    kb?.admin_phone;

  const latestUserQuestion = useMemo(() => {
    for (let i = messages.length - 1; i >= 0; i -= 1) {
      if (messages[i].sender === 'user') {
        const msg = messages[i];
        if (msg.sender === 'user') return msg.text;
      }
    }
    return lastTypedQuery || query.trim();
  }, [messages, lastTypedQuery, query]);

  const adminWhatsAppUrl = useMemo(
    () =>
      buildAdminWhatsAppUrl(
        configuredAdminPhone,
        role,
        session,
        latestUserQuestion
      ),
    [configuredAdminPhone, role, session, latestUserQuestion]
  );

  const drawerPositionClass = hasMobileBottomNav
    ? 'fixed inset-x-3 bottom-[calc(4.75rem+env(safe-area-inset-bottom,0px))] max-h-[72dvh] sm:inset-x-auto sm:right-5 sm:w-[370px] sm:max-w-[calc(100vw-2rem)] lg:bottom-20 lg:max-h-[72vh] rounded-3xl z-[55]'
    : 'fixed inset-x-3 bottom-4 max-h-[72dvh] sm:inset-x-auto sm:right-5 sm:bottom-20 sm:w-[370px] sm:max-w-[calc(100vw-2rem)] sm:max-h-[72vh] rounded-3xl z-[55]';

  return (
    <>
      <div
        className="sm:hidden fixed inset-0 z-[54] bg-black/15"
        aria-hidden="true"
        onClick={onClose}
      />

      <section
        role="dialog"
        aria-label="സഹായി (Smart Help Assistant)"
        className={`${drawerPositionClass} ${styles.cardSurface} flex flex-col overflow-hidden`}
      >
        {/* Header */}
        <header
          className={`px-4 py-3 shrink-0 flex items-center justify-between gap-2 ${styles.headerBorder}`}
        >
          <div className="flex items-center gap-2.5 min-w-0">
            <div
              className={`w-8 h-8 rounded-xl ${styles.accentBg} flex items-center justify-center shrink-0 shadow-sm`}
            >
              <Sparkles className="w-4 h-4" />
            </div>
            <div className="min-w-0">
              <div className="flex items-center gap-1.5 flex-wrap">
                <h2
                  className={`font-ml text-sm font-bold leading-tight ${styles.headingText}`}
                >
                  സഹായി
                </h2>
                <span className={`text-[11px] font-semibold ${styles.mutedText}`}>
                  (Smart Help)
                </span>
                <span
                  className={`inline-flex items-center px-2 py-0.5 rounded-full text-[10px] font-semibold ${styles.badge}`}
                >
                  Instant • Offline
                </span>
              </div>
              {session && (
                <p
                  className={`text-[11px] truncate ${styles.mutedText}`}
                >
                  <BrandText text={session.name} />
                </p>
              )}
            </div>
          </div>

          <div className="flex items-center gap-1 shrink-0">
            {(messages.length > 0 || selectedCategoryId !== null) && (
              <button
                type="button"
                onClick={handleResetHome}
                aria-label="Reset assistant home"
                title="ഹോം"
                className={`p-1.5 rounded-full transition-colors ${styles.iconButton}`}
              >
                <Home className="w-4 h-4" />
              </button>
            )}
            <button
              type="button"
              onClick={onClose}
              aria-label="Close assistant"
              className={`p-1.5 rounded-full transition-colors ${styles.iconButton}`}
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        </header>

        {/* Scrollable Body */}
        <div className="flex-1 min-h-0 overflow-y-auto px-3.5 py-3 space-y-3">
          {!kb ? (
            <div className={`font-ml text-xs py-6 text-center ${styles.mutedText}`}>
              വിവരങ്ങൾ ലോഡ് ചെയ്യുന്നു...
            </div>
          ) : messages.length === 0 ? (
            <div className="space-y-3">
              <p
                className={`font-ml text-xs font-medium leading-relaxed ${styles.bodyText}`}
              >
                നിങ്ങളുടെ സംശയം താഴെ തിരഞ്ഞെടുക്കുകയോ ടൈപ്പ് ചെയ്യുകയോ ചെയ്യാം.
              </p>

              {/* Role-Aware Category Pills */}
              <div className="flex flex-wrap gap-1.5">
                {visibleCategories.map((cat) => {
                  const Icon = CATEGORY_ICONS[cat.icon] ?? Sparkles;
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
                      className={`inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-xl text-[11px] font-ml font-semibold transition-colors ${
                        active ? styles.categoryActive : styles.categoryIdle
                      }`}
                    >
                      <Icon className="w-3.5 h-3.5 shrink-0" />
                      <span>{cat.label}</span>
                    </button>
                  );
                })}
              </div>

              {/* Category or Quick Questions */}
              <div className="space-y-1.5">
                <p
                  className={`font-ml text-[11px] font-bold ${styles.mutedText}`}
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
                      className={`w-full text-left rounded-2xl px-3 py-2.5 flex items-center justify-between gap-2 transition-colors ${styles.chipButton}`}
                    >
                      <span
                        className={`font-ml text-xs font-semibold leading-snug ${styles.headingText}`}
                      >
                        {item.question}
                      </span>
                      <ChevronRight
                        className={`w-4 h-4 shrink-0 ${styles.mutedText}`}
                      />
                    </button>
                  )
                )}
              </div>
            </div>
          ) : (
            <div className="space-y-2.5">
              {messages.map((msg) => {
                if (msg.sender === 'user') {
                  return (
                    <div key={msg.id} className="flex justify-end">
                      <div
                        className={`max-w-[85%] rounded-2xl rounded-br-md px-3 py-2 font-ml text-xs font-medium leading-snug shadow-sm ${styles.accentBg}`}
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
                      <div
                        className={`rounded-2xl rounded-tl-md p-3 space-y-2 shadow-sm ${styles.answerBubble}`}
                      >
                        <p
                          className={`font-ml text-xs font-bold leading-snug ${styles.headingText}`}
                        >
                          {msg.item.question}
                        </p>
                        <p
                          className={`font-ml text-xs leading-relaxed ${styles.bodyText}`}
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

                      {followUpItems.length > 0 && (
                        <div className="flex flex-wrap gap-1.5 pl-1">
                          {followUpItems.map((fi) => (
                            <button
                              key={fi.id}
                              type="button"
                              onClick={() => selectQuestion(fi)}
                              className={`text-left px-2.5 py-1.5 rounded-xl font-ml text-[11px] font-semibold transition-colors ${styles.chipButton}`}
                            >
                              {fi.question}
                            </button>
                          ))}
                        </div>
                      )}
                    </div>
                  );
                }

                return (
                  <div
                    key={msg.id}
                    className={`rounded-2xl rounded-tl-md p-3 space-y-2.5 shadow-sm ${styles.answerBubble}`}
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
                      <span>സംശയം തീർന്നില്ലേ? അഡ്മിനോട് WhatsApp-ൽ ചോദിക്കുക</span>
                    </a>
                  </div>
                );
              })}

              {/* Compact Footer WhatsApp Link below active answers */}
              <div className="pt-1 flex justify-center">
                <a
                  href={adminWhatsAppUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full font-ml text-[11px] font-semibold transition-colors ${styles.badge} hover:opacity-90`}
                >
                  <MessageCircle className="w-3.5 h-3.5 text-emerald-700 shrink-0" />
                  <span>സംശയം തീർന്നില്ലേ? അഡ്മിനോട് WhatsApp-ൽ ചോദിക്കുക</span>
                </a>
              </div>
              <div ref={scrollEndRef} />
            </div>
          )}
        </div>

        {/* Pinned Search Input + Live Autocomplete Predictions */}
        <div
          className={`relative px-3 pt-2 pb-3 shrink-0 border-t ${
            theme === 'orange'
              ? 'border-[#EC5E27]/[0.14]'
              : theme === 'forest'
                ? 'border-[#043326]/[0.10]'
                : 'border-[#381932]/[0.10]'
          }`}
        >
          {livePredictions.length > 0 && (
            <div
              role="listbox"
              aria-label="നിർദ്ദേശിച്ച ചോദ്യങ്ങൾ"
              className={`absolute left-3 right-3 bottom-full mb-1.5 rounded-2xl p-1.5 space-y-1 z-10 ${styles.dropdownSurface}`}
            >
              {livePredictions.map((res) => (
                <button
                  key={res.item.id}
                  type="button"
                  onClick={() => selectQuestion(res.item)}
                  className={`w-full text-left px-2.5 py-2 rounded-xl flex items-center justify-between gap-2 transition-colors hover:bg-black/5`}
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

          <form onSubmit={handleSubmit} className="flex items-center gap-2">
            <input
              ref={inputRef}
              type="text"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
              placeholder="സംശയം ടൈപ്പ് ചെയ്യുക (ഉദാ: password, unpaid, pdf)..."
              aria-label="Search help question"
              className={`flex-1 min-w-0 rounded-2xl px-3.5 py-2 text-xs font-ml transition-colors ${styles.inputClass}`}
            />
            <button
              type="submit"
              disabled={!query.trim() || !kb}
              aria-label="Submit help question"
              className={`h-9 w-9 rounded-2xl shrink-0 flex items-center justify-center transition-colors disabled:opacity-45 ${styles.accentBg}`}
            >
              <Send className="w-4 h-4" />
            </button>
          </form>
        </div>
      </section>
    </>
  );
}

export default SmartAssistantDrawer;
