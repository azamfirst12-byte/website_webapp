'use client';

import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from 'react';
import type { ModalKind, PublicWorkspace } from '@/lib/workspace-types';

export type FormName = 'contact' | 'booking';
export type FormValues = Record<string, string>;

interface SiteCtx {
  ws: PublicWorkspace;
  modal: { kind: ModalKind; item?: string } | null;
  openModal: (kind: ModalKind, item?: string) => void;
  closeModal: () => void;
  menu: 'main' | 'services' | null;
  setMenu: (m: 'main' | 'services' | null) => void;
  serviceIndustry: string;
  setServiceIndustry: (v: string) => void;
  serviceCategory: string;
  setServiceCategory: (v: string) => void;
  workIndustry: string;
  setWorkIndustry: (v: string) => void;
  query: string;
  setQuery: (v: string) => void;
  billing: 'monthly' | 'annual';
  setBilling: (v: 'monthly' | 'annual') => void;
  forms: Record<FormName, FormValues>;
  setForm: (form: FormName, patch: FormValues) => void;
  resetForm: (form: FormName) => void;
  formSent: Record<FormName, boolean>;
  setFormSent: (form: FormName, sent: boolean) => void;
  compare: { kind: 'plans' | 'services'; items: string[] };
  setCompare: (c: { kind: 'plans' | 'services'; items: string[] }) => void;
  focusItem: string | null;
  setFocusItem: (id: string | null) => void;
  /** Current assistant action shown as a chip (visual feedback). */
  action: { label: string; ok?: boolean; at: number } | null;
  showAction: (label: string, ok?: boolean) => void;
  assistantOpen: boolean;
  setAssistantOpen: (v: boolean) => void;
  leadId: number | null;
  setLeadId: (id: number | null) => void;
}

const Ctx = createContext<SiteCtx | null>(null);

export function SiteProvider({ ws, children }: { ws: PublicWorkspace; children: ReactNode }) {
  const [modal, setModal] = useState<SiteCtx['modal']>(null);
  const [menu, setMenu] = useState<SiteCtx['menu']>(null);
  const [serviceIndustry, setServiceIndustry] = useState('all');
  const [serviceCategory, setServiceCategory] = useState('all');
  const [workIndustry, setWorkIndustry] = useState('all');
  const [query, setQuery] = useState('');
  const [billing, setBilling] = useState<'monthly' | 'annual'>('monthly');
  const [forms, setForms] = useState<Record<FormName, FormValues>>({ contact: {}, booking: {} });
  const [formSent, setFormSentState] = useState<Record<FormName, boolean>>({ contact: false, booking: false });
  const [compare, setCompare] = useState<SiteCtx['compare']>({ kind: 'plans', items: [] });
  const [focusItem, setFocusItem] = useState<string | null>(null);
  const [action, setAction] = useState<SiteCtx['action']>(null);
  const [assistantOpen, setAssistantOpen] = useState(false);
  const [leadId, setLeadIdState] = useState<number | null>(null);
  const actionTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    try {
      const l = sessionStorage.getItem('ww_lead');
      if (l) setLeadIdState(Number(l));
      // Contact details typed once are reused by every form in this tab.
      const f = sessionStorage.getItem('ww_forms');
      if (f) setForms(JSON.parse(f));
    } catch {}
  }, []);
  useEffect(() => {
    try {
      sessionStorage.setItem('ww_forms', JSON.stringify(forms));
    } catch {}
  }, [forms]);

  // Escape closes popups and menus.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      setModal(null);
      setMenu(null);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);

  const showAction = useCallback((label: string, ok?: boolean) => {
    setAction({ label, ok, at: Date.now() });
    if (actionTimer.current) clearTimeout(actionTimer.current);
    actionTimer.current = setTimeout(() => setAction(null), 2600);
  }, []);

  const setForm = useCallback((form: FormName, patch: FormValues) => {
    setForms((f) => {
      const next = { ...f, [form]: { ...f[form], ...patch } };
      // Shared contact fields flow between the two forms.
      const other: FormName = form === 'contact' ? 'booking' : 'contact';
      for (const k of ['name', 'email', 'phone', 'company']) if (patch[k] && !next[other][k]) next[other] = { ...next[other], [k]: patch[k] };
      return next;
    });
  }, []);

  const value = useMemo<SiteCtx>(
    () => ({
      ws,
      modal,
      openModal: (kind, item) => {
        setMenu(null);
        setModal({ kind, item });
      },
      closeModal: () => setModal(null),
      menu,
      setMenu,
      serviceIndustry,
      setServiceIndustry,
      serviceCategory,
      setServiceCategory,
      workIndustry,
      setWorkIndustry,
      query,
      setQuery,
      billing,
      setBilling,
      forms,
      setForm,
      resetForm: (form) => setForms((f) => ({ ...f, [form]: { name: f[form].name ?? '', email: f[form].email ?? '', phone: f[form].phone ?? '', company: f[form].company ?? '' } })),
      formSent,
      setFormSent: (form, sent) => setFormSentState((s) => ({ ...s, [form]: sent })),
      compare,
      setCompare,
      focusItem,
      setFocusItem,
      action,
      showAction,
      assistantOpen,
      setAssistantOpen,
      leadId,
      setLeadId: (id) => {
        setLeadIdState(id);
        try {
          if (id) sessionStorage.setItem('ww_lead', String(id));
          else sessionStorage.removeItem('ww_lead');
        } catch {}
      },
    }),
    [ws, modal, menu, serviceIndustry, serviceCategory, workIndustry, query, billing, forms, setForm, formSent, compare, focusItem, action, showAction, assistantOpen, leadId],
  );

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useSite() {
  const v = useContext(Ctx);
  if (!v) throw new Error('useSite outside SiteProvider');
  return v;
}

/** Links and page paths from the workspace. */
export function pagePath(ws: PublicWorkspace, key: string) {
  return ws.pages.find((p) => p.key === key && p.enabled)?.path ?? (key === 'home' ? '/' : `/${key}`);
}
