import { useEffect, useState, useCallback, useRef, useMemo } from 'react'
import { Plus, Pencil, Trash2, ChevronLeft, ChevronRight, X } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'
import { sendNotification } from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

/** Estrae email valide da un campo partecipanti (separati da virgola/spazio/punto-e-virgola) */
function parseParticipants(raw: string | null | undefined): string[] {
  if (!raw) return []
  return raw.split(/[,;\s]+/).map(s => s.trim()).filter(s => s.includes('@'))
}

/* ─── Types ─── */

type Vista = 'mese' | 'settimana'

interface Evento {
  id: string
  user_id: string
  titolo: string
  descrizione: string | null
  data_inizio: string
  data_fine: string
  ora_inizio: string
  ora_fine: string
  tipo: TipoEvento
  luogo: string | null
  partecipanti: string | null
  promemoria_minuti: number | null
  colore: string
  created_at: string
}

type TipoEvento = 'appuntamento' | 'meeting' | 'scadenza' | 'promemoria' | 'altro'

const TIPO_LABEL: Record<TipoEvento, string> = {
  appuntamento: 'Appuntamento',
  meeting: 'Meeting',
  scadenza: 'Scadenza',
  promemoria: 'Promemoria',
  altro: 'Altro',
}

const COLORI = ['#1A2332', '#005DEF', '#6C7F94', '#DC2626', '#059669', '#D97706', '#7C3AED']

/* ─── Hook ─── */

const useWindowWidth = () => {
  const [w, setW] = useState(typeof window !== 'undefined' ? window.innerWidth : 1024)
  useEffect(() => {
    const h = () => setW(window.innerWidth)
    window.addEventListener('resize', h)
    return () => window.removeEventListener('resize', h)
  }, [])
  return w
}

/* ─── Helpers ─── */

const pad = (n: number) => String(n).padStart(2, '0')

const fmtDateISO = (d: Date) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`

const GIORNI = ['Lun', 'Mar', 'Mer', 'Gio', 'Ven', 'Sab', 'Dom']
const MESI = ['Gennaio', 'Febbraio', 'Marzo', 'Aprile', 'Maggio', 'Giugno', 'Luglio', 'Agosto', 'Settembre', 'Ottobre', 'Novembre', 'Dicembre']


const parseTimeToMinutes = (time: string): number => {
  const [h, m] = time.split(':').map(Number)
  return h * 60 + (m || 0)
}

const getMonthDays = (year: number, month: number): Date[] => {
  const first = new Date(year, month, 1)
  const dayOfWeek = (first.getDay() + 6) % 7
  const start = new Date(first)
  start.setDate(start.getDate() - dayOfWeek)
  const days: Date[] = []
  for (let i = 0; i < 42; i++) {
    days.push(new Date(start))
    start.setDate(start.getDate() + 1)
  }
  return days
}

const getWeekDays = (baseDate: Date): Date[] => {
  const d = new Date(baseDate)
  const dayOfWeek = (d.getDay() + 6) % 7
  d.setDate(d.getDate() - dayOfWeek)
  const days: Date[] = []
  for (let i = 0; i < 7; i++) {
    days.push(new Date(d))
    d.setDate(d.getDate() + 1)
  }
  return days
}

/* Layout eventi sovrapposti: assegna colonna a ciascun evento */
interface EventoLayered extends Evento {
  colIdx: number
  colCount: number
}

const layoutEvents = (events: Evento[]): EventoLayered[] => {
  const sorted = [...events].sort((a, b) => {
    const diff = parseTimeToMinutes(a.ora_inizio) - parseTimeToMinutes(b.ora_inizio)
    return diff !== 0 ? diff : parseTimeToMinutes(a.ora_fine) - parseTimeToMinutes(b.ora_fine)
  })

  // groups di eventi sovrapposti
  type Group = { end: number; events: EventoLayered[] }
  const groups: Group[] = []

  for (const ev of sorted) {
    const start = parseTimeToMinutes(ev.ora_inizio)
    const end = parseTimeToMinutes(ev.ora_fine)

    // cerca gruppo con overlap
    let placed = false
    for (const grp of groups) {
      if (start < grp.end) {
        // overlapping group
        const colIdx = grp.events.length
        const layered: EventoLayered = { ...ev, colIdx, colCount: 1 }
        grp.events.push(layered)
        grp.end = Math.max(grp.end, end)
        placed = true
        break
      }
    }
    if (!placed) {
      const layered: EventoLayered = { ...ev, colIdx: 0, colCount: 1 }
      groups.push({ end, events: [layered] })
    }
  }

  // aggiorna colCount per ogni gruppo
  const result: EventoLayered[] = []
  for (const grp of groups) {
    const count = grp.events.length
    for (const ev of grp.events) {
      result.push({ ...ev, colCount: count })
    }
  }
  return result
}

const emptyForm = (date?: string) => ({
  titolo: '',
  descrizione: '',
  data_inizio: date ?? fmtDateISO(new Date()),
  data_fine: date ?? fmtDateISO(new Date()),
  ora_inizio: '09:00',
  ora_fine: '10:00',
  tipo: 'appuntamento' as TipoEvento,
  luogo: '',
  partecipanti: '',
  promemoria_minuti: 15 as number | null,
  colore: COLORI[0],
})

/* ─── Component ─── */

export const CalendarioPage = () => {
  const windowWidth = useWindowWidth()
  const isMobile = windowWidth < 640

  const [eventi, setEventi] = useState<Evento[]>([])
  const [loading, setLoading] = useState(true)

  const [vista, setVista] = useState<Vista>('mese')
  const today = new Date()
  const [currentDate, setCurrentDate] = useState(today)
  const [selectedDate, setSelectedDate] = useState<string | null>(null)

  const [modal, setModal] = useState(false)
  const [editing, setEditing] = useState<Evento | null>(null)
  const [form, setForm] = useState(emptyForm())
  const [saving, setSaving] = useState(false)
  const [saveError, setSaveError] = useState<string | null>(null)
  const [deleteId, setDeleteId] = useState<string | null>(null)

  const [detailEvent, setDetailEvent] = useState<Evento | null>(null)

  const loadEventi = useCallback(async () => {
    const { data } = await supabase
      .from('calendario_eventi')
      .select('*')
      .order('data_inizio', { ascending: true })
    setEventi(data ?? [])
    setLoading(false)
  }, [])

  useEffect(() => { loadEventi() }, [loadEventi])

  /* Navigation */
  const nav = (dir: -1 | 1) => {
    const d = new Date(currentDate)
    if (vista === 'mese') d.setMonth(d.getMonth() + dir)
    else if (isMobile) d.setDate(d.getDate() + dir)
    else d.setDate(d.getDate() + 7 * dir)
    setCurrentDate(d)
  }

  const goToday = () => setCurrentDate(new Date())

  /* CRUD */
  const openNew = (date?: string) => {
    setEditing(null)
    setForm(emptyForm(date))
    setSaveError(null)
    setModal(true)
  }

  const openEdit = (ev: Evento) => {
    setEditing(ev)
    setForm({
      titolo: ev.titolo,
      descrizione: ev.descrizione ?? '',
      data_inizio: ev.data_inizio,
      data_fine: ev.data_fine,
      ora_inizio: ev.ora_inizio,
      ora_fine: ev.ora_fine,
      tipo: ev.tipo,
      luogo: ev.luogo ?? '',
      partecipanti: ev.partecipanti ?? '',
      promemoria_minuti: ev.promemoria_minuti ?? 15,
      colore: ev.colore ?? COLORI[0],
    })
    setSaveError(null)
    setDetailEvent(null)
    setModal(true)
  }

  const saveEvento = async (e: React.SyntheticEvent) => {
    e.preventDefault()
    if (!form.titolo.trim()) return
    setSaving(true)
    setSaveError(null)
    const { data: { user } } = await supabase.auth.getUser()
    if (!user) { setSaving(false); return }
    const payload = {
      user_id: user.id,
      titolo: form.titolo.trim(),
      descrizione: form.descrizione.trim() || null,
      data_inizio: form.data_inizio,
      data_fine: form.data_fine,
      ora_inizio: form.ora_inizio,
      ora_fine: form.ora_fine,
      tipo: form.tipo,
      luogo: form.luogo.trim() || null,
      partecipanti: form.partecipanti.trim() || null,
      promemoria_minuti: form.promemoria_minuti,
      colore: form.colore,
    }
    const { error } = editing
      ? await supabase.from('calendario_eventi').update(payload).eq('id', editing.id)
      : await supabase.from('calendario_eventi').insert(payload)
    if (error) { setSaveError(safeErrorMessage(error)); setSaving(false); return }

    // ── Notifica creazione evento ai partecipanti ──────────────────────────
    if (!editing) {
      const destinatari = new Set<string>([ADMIN_EMAIL])
      parseParticipants(form.partecipanti).forEach(e => destinatari.add(e))
      const fmtDateIt = (iso: string) =>
        new Date(iso).toLocaleDateString('it-IT', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' })
      const dataFormattata = fmtDateIt(form.data_inizio)
      const luogo = form.luogo.trim() || null
      const descrizione = form.descrizione.trim() || null
      sendNotification({
        to: [...destinatari],
        subject: `📅 Nuovo evento: ${form.titolo}`,
        params: {
          notification_label: 'NUOVO EVENTO CALENDARIO',
          email_title: 'Evento aggiunto al calendario',
          email_subtitle: form.titolo,
          recipient_name: 'Team',
          intro_text: `È stato aggiunto un nuovo evento al calendario: "${form.titolo}". Riceverai un promemoria 5, 3 e 1 giorno prima della data.`,
          update_type: `Evento — ${form.tipo}`,
          subject: form.titolo,
          reference_code: `Tipo: ${form.tipo}`,
          date: `${dataFormattata} — ${form.ora_inizio} / ${form.ora_fine}`,
          status: 'Programmato',
          message_body: `Nuovo evento in calendario:<br><br><strong>${form.titolo}</strong><br>Data: <strong>${dataFormattata}</strong><br>Orario: <strong>${form.ora_inizio} – ${form.ora_fine}</strong>${luogo ? `<br>Luogo: <strong>${luogo}</strong>` : ''}${descrizione ? `<br><br>${descrizione}` : ''}`,
          next_steps: 'Riceverai promemoria automatici 5, 3 e 1 giorno prima dell\'evento. Puoi visualizzare tutti i dettagli nel calendario.',
          cta_url: 'https://gestionale.agentics.eu/calendario',
          cta_label: 'Apri il Calendario →',
          secondary_note: luogo ? `Luogo: ${luogo}` : '',
          footer_text: 'Notifica automatica — gestionale Agentics.',
        },
      })
    }
    // ───────────────────────────────────────────────────────────────────────

    setSaving(false)
    setModal(false)
    loadEventi()
  }

  const removeEvento = async () => {
    if (!deleteId) return
    await supabase.from('calendario_eventi').delete().eq('id', deleteId)
    setDeleteId(null)
    setDetailEvent(null)
    loadEventi()
  }

  /* Queries */
  const eventsOnDate = useCallback((dateStr: string) => eventi.filter(ev => {
    const date = dateStr.slice(0, 10)
    const start = ev.data_inizio.slice(0, 10)
    const end = ev.data_fine.slice(0, 10)
    return date >= start && date <= end
  }), [eventi])
  const todayStr = fmtDateISO(today)

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13, padding: 32 }}>Caricamento...</div>

  const year = currentDate.getFullYear()
  const month = currentDate.getMonth()

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

      {/* Toolbar */}
      <div style={{ display: 'flex', flexDirection: isMobile ? 'column' : 'row', justifyContent: 'space-between', alignItems: isMobile ? 'stretch' : 'center', marginBottom: 16, gap: isMobile ? 8 : 0 }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
          <button onClick={() => nav(-1)} style={{ background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer', padding: '6px 8px', display: 'flex', color: '#1A2332' }}>
            <ChevronLeft style={{ width: 14, height: 14 }} />
          </button>
          <button onClick={() => nav(1)} style={{ background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer', padding: '6px 8px', display: 'flex', color: '#1A2332' }}>
            <ChevronRight style={{ width: 14, height: 14 }} />
          </button>
          <span style={{ fontSize: isMobile ? 14 : 16, fontWeight: 700, color: '#1A2332', flex: 1 }}>
            {vista === 'mese'
              ? `${MESI[month]} ${year}`
              : isMobile
                ? `${pad(currentDate.getDate())} ${MESI[currentDate.getMonth()].slice(0, 3)} ${currentDate.getFullYear()}`
                : (() => {
                    const wk = getWeekDays(currentDate)
                    const s = wk[0]; const e = wk[6]
                    return `${pad(s.getDate())} ${MESI[s.getMonth()].slice(0, 3)} – ${pad(e.getDate())} ${MESI[e.getMonth()].slice(0, 3)} ${e.getFullYear()}`
                  })()
            }
          </span>
          <Button size="sm" variant="ghost" onClick={goToday}>Oggi</Button>
        </div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, justifyContent: isMobile ? 'space-between' : 'flex-end' }}>
          {!isMobile && (
            <div style={{ display: 'flex', border: '1px solid #E5E7EB' }}>
              {(['mese', 'settimana'] as Vista[]).map(v => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  style={{
                    padding: '5px 14px', fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: vista === v ? '#1A2332' : '#fff',
                    color: vista === v ? '#fff' : '#6C7F94',
                  }}
                >
                  {v === 'mese' ? 'Mese' : 'Settimana'}
                </button>
              ))}
            </div>
          )}
          {isMobile && (
            <div style={{ display: 'flex', border: '1px solid #E5E7EB' }}>
              {(['mese', 'settimana'] as Vista[]).map(v => (
                <button
                  key={v}
                  onClick={() => setVista(v)}
                  style={{
                    padding: '5px 10px', fontSize: 10, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em',
                    border: 'none', cursor: 'pointer',
                    backgroundColor: vista === v ? '#1A2332' : '#fff',
                    color: vista === v ? '#fff' : '#6C7F94',
                  }}
                >
                  {v === 'mese' ? 'Mese' : 'Giorno'}
                </button>
              ))}
            </div>
          )}
          <Button size="sm" onClick={() => openNew()}><Plus style={{ width: 12, height: 12 }} /> {isMobile ? 'Nuovo' : 'Nuovo evento'}</Button>
        </div>
      </div>

      {/* Calendar */}
      {vista === 'mese' ? (
        <MonthView
          year={year}
          month={month}
          todayStr={todayStr}
          selectedDate={selectedDate}
          eventsOnDate={eventsOnDate}
          onSelectDate={setSelectedDate}
          onNewEvent={openNew}
          onClickEvent={setDetailEvent}
          isMobile={isMobile}
        />
      ) : (
        <WeekView
          baseDate={currentDate}
          todayStr={todayStr}
          eventsOnDate={eventsOnDate}
          onNewEvent={openNew}
          onClickEvent={setDetailEvent}
          isMobile={isMobile}
        />
      )}

      {/* Day detail sidebar */}
      {selectedDate && vista === 'mese' && (
        <DayDetail
          dateStr={selectedDate}
          events={eventsOnDate(selectedDate)}
          onClose={() => setSelectedDate(null)}
          onNew={() => openNew(selectedDate)}
          onClickEvent={setDetailEvent}
        />
      )}

      {/* Event detail modal */}
      <Modal open={!!detailEvent} onClose={() => setDetailEvent(null)} title={detailEvent?.titolo ?? ''} width={isMobile ? 'calc(100vw - 32px)' : '440px'}>
        {detailEvent && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16 }}>
              <div style={{ width: 10, height: 10, backgroundColor: detailEvent.colore, flexShrink: 0 }} />
              <span style={{ fontSize: 11, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', fontWeight: 600 }}>{TIPO_LABEL[detailEvent.tipo]}</span>
            </div>
            <div style={{ borderTop: '1px solid #F3F4F6' }}>
              <DetailRow label="Data" value={detailEvent.data_inizio === detailEvent.data_fine ? formatDateLong(detailEvent.data_inizio) : `${formatDateLong(detailEvent.data_inizio)} – ${formatDateLong(detailEvent.data_fine)}`} />
              <DetailRow label="Orario" value={`${detailEvent.ora_inizio} – ${detailEvent.ora_fine}`} />
              {detailEvent.luogo && <DetailRow label="Luogo" value={detailEvent.luogo} />}
              {detailEvent.partecipanti && <DetailRow label="Partecipanti" value={detailEvent.partecipanti} />}
              {detailEvent.promemoria_minuti != null && <DetailRow label="Promemoria" value={`${detailEvent.promemoria_minuti} min prima`} />}
            </div>
            {detailEvent.descrizione && (
              <div style={{ marginTop: 16 }}>
                <div style={{ fontSize: 11, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 6, fontWeight: 600 }}>Note</div>
                <div style={{ fontSize: 13, color: '#4B5563', lineHeight: 1.6, whiteSpace: 'pre-wrap' }}>{detailEvent.descrizione}</div>
              </div>
            )}
            <div style={{ display: 'flex', gap: 8, justifyContent: 'flex-end', paddingTop: 20 }}>
              <Button size="sm" variant="ghost" onClick={() => openEdit(detailEvent)}><Pencil style={{ width: 11, height: 11 }} /> Modifica</Button>
              <Button size="sm" variant="danger" onClick={() => { setDeleteId(detailEvent.id); setDetailEvent(null) }}><Trash2 style={{ width: 11, height: 11 }} /> Elimina</Button>
            </div>
          </div>
        )}
      </Modal>

      {/* Create/Edit modal */}
      <Modal open={modal} onClose={() => setModal(false)} title={editing ? 'Modifica evento' : 'Nuovo evento'} width={isMobile ? 'calc(100vw - 32px)' : '520px'}>
        <form onSubmit={saveEvento} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {saveError && <p style={{ fontSize: 12, color: '#DC2626' }}>{saveError}</p>}
          <FormField label="Titolo" required>
            <Input value={form.titolo} onChange={e => setForm(p => ({ ...p, titolo: e.target.value }))} maxLength={200} />
          </FormField>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Data inizio" required>
              <Input type="date" value={form.data_inizio} onChange={e => setForm(p => ({ ...p, data_inizio: e.target.value, data_fine: p.data_fine < e.target.value ? e.target.value : p.data_fine }))} />
            </FormField>
            <FormField label="Data fine" required>
              <Input type="date" value={form.data_fine} onChange={e => setForm(p => ({ ...p, data_fine: e.target.value }))} min={form.data_inizio} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <FormField label="Ora inizio" required>
              <Input type="time" value={form.ora_inizio} onChange={e => setForm(p => ({ ...p, ora_inizio: e.target.value }))} />
            </FormField>
            <FormField label="Ora fine" required>
              <Input type="time" value={form.ora_fine} onChange={e => setForm(p => ({ ...p, ora_fine: e.target.value }))} />
            </FormField>
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 14 }}>
            <FormField label="Tipo">
              <Select value={form.tipo} onChange={e => setForm(p => ({ ...p, tipo: e.target.value as TipoEvento }))}>
                {Object.entries(TIPO_LABEL).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </Select>
            </FormField>
            <FormField label="Promemoria (min)">
              <Input type="number" value={form.promemoria_minuti ?? ''} onChange={e => setForm(p => ({ ...p, promemoria_minuti: e.target.value ? Number(e.target.value) : null }))} min={0} />
            </FormField>
          </div>
          <FormField label="Luogo">
            <Input value={form.luogo} onChange={e => setForm(p => ({ ...p, luogo: e.target.value }))} maxLength={300} placeholder="Indirizzo o link meeting" />
          </FormField>
          <FormField label="Partecipanti">
            <Input value={form.partecipanti} onChange={e => setForm(p => ({ ...p, partecipanti: e.target.value }))} maxLength={500} placeholder="Nome, email..." />
          </FormField>
          <FormField label="Note">
            <TextArea value={form.descrizione} onChange={e => setForm(p => ({ ...p, descrizione: e.target.value }))} maxLength={1000} style={{ minHeight: 70 }} />
          </FormField>
          <div>
            <div style={{ fontSize: 11, fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 6 }}>Colore</div>
            <div style={{ display: 'flex', gap: 6 }}>
              {COLORI.map(c => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setForm(p => ({ ...p, colore: c }))}
                  style={{
                    width: 24, height: 24, backgroundColor: c, border: form.colore === c ? '2px solid #1A2332' : '2px solid transparent',
                    cursor: 'pointer', padding: 0,
                  }}
                />
              ))}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 6 }}>
            <Button type="button" variant="ghost" onClick={() => setModal(false)}>Annulla</Button>
            <Button type="submit" disabled={saving || !form.titolo.trim()}>{saving ? 'Salvataggio...' : editing ? 'Salva' : 'Crea evento'}</Button>
          </div>
        </form>
      </Modal>

      {/* Delete modal */}
      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title="Elimina evento" width={isMobile ? 'calc(100vw - 32px)' : '360px'}>
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>Eliminare questo evento dal calendario?</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Annulla</Button>
          <Button variant="danger" onClick={removeEvento}>Elimina</Button>
        </div>
      </Modal>
    </div>
  )
}

/* ─── Sub-components ─── */

const DetailRow = ({ label, value }: { label: string; value: string }) => (
  <div style={{ display: 'flex', justifyContent: 'space-between', padding: '10px 0', borderBottom: '1px solid #F3F4F6' }}>
    <span style={{ fontSize: 12, color: '#6C7F94' }}>{label}</span>
    <span style={{ fontSize: 12, fontWeight: 600, color: '#1A2332', textAlign: 'right', maxWidth: '60%' }}>{value}</span>
  </div>
)

const formatDateLong = (d: string) => {
  const dt = new Date(d + 'T00:00:00')
  return dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' })
}

/* ── Month View ── */

const MonthView = ({
  year, month, todayStr, selectedDate, eventsOnDate, onSelectDate, onNewEvent, onClickEvent, isMobile,
}: {
  year: number; month: number; todayStr: string; selectedDate: string | null
  eventsOnDate: (d: string) => Evento[]; onSelectDate: (d: string) => void
  onNewEvent: (d: string) => void; onClickEvent: (e: Evento) => void; isMobile: boolean
}) => {
  const days = getMonthDays(year, month)
  return (
    <div style={{ border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
      {/* Header */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {GIORNI.map(g => (
          <div key={g} style={{ padding: '8px 0', textAlign: 'center', fontSize: 10, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em', borderBottom: '1px solid #E5E7EB' }}>
            {g}
          </div>
        ))}
      </div>
      {/* Grid */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(7, 1fr)' }}>
        {days.map((d, i) => {
          const dateStr = fmtDateISO(d)
          const isCurrentMonth = d.getMonth() === month
          const isToday = dateStr === todayStr
          const isSelected = dateStr === selectedDate
          const dayEvents = eventsOnDate(dateStr)
          const sorted = [...dayEvents].sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))
          return (
            <div
              key={i}
              onClick={() => onSelectDate(dateStr)}
              onDoubleClick={() => onNewEvent(dateStr)}
              style={{
                minHeight: isMobile ? 52 : 90,
                padding: isMobile ? '3px 2px' : '4px 2px',
                borderRight: (i + 1) % 7 !== 0 ? '1px solid #F3F4F6' : 'none',
                borderBottom: i < 35 ? '1px solid #F3F4F6' : 'none',
                backgroundColor: isSelected ? '#F8F9FB' : '#fff',
                cursor: 'pointer',
                opacity: isCurrentMonth ? 1 : 0.35,
                display: 'flex', flexDirection: 'column', alignItems: 'center',
              }}
            >
              <div style={{
                fontSize: isMobile ? 11 : 12, fontWeight: isToday ? 700 : 400,
                color: isToday ? '#fff' : '#1A2332',
                width: isMobile ? 20 : 22, height: isMobile ? 20 : 22,
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? '#1A2332' : 'transparent',
                borderRadius: '50%', marginBottom: 2, flexShrink: 0,
              }}>
                {d.getDate()}
              </div>
              {isMobile ? (
                /* Dot indicators su mobile */
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 2, justifyContent: 'center', alignSelf: 'stretch' }}>
                  {sorted.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onClickEvent(ev) }}
                      style={{
                        width: 6, height: 6, borderRadius: '50%',
                        backgroundColor: ev.colore || '#1A2332',
                        cursor: 'pointer', flexShrink: 0,
                      }}
                    />
                  ))}
                  {sorted.length > 3 && (
                    <div style={{ width: 6, height: 6, borderRadius: '50%', backgroundColor: '#9CA3AF', flexShrink: 0 }} />
                  )}
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 1, alignSelf: 'stretch', padding: '0 4px' }}>
                  {sorted.slice(0, 3).map(ev => (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onClickEvent(ev) }}
                      style={{
                        fontSize: 10, fontWeight: 500, color: '#fff',
                        backgroundColor: ev.colore || '#1A2332',
                        padding: '1px 4px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap',
                        cursor: 'pointer', borderRadius: 2,
                      }}
                    >
                      {ev.ora_inizio.slice(0, 5)} {ev.titolo}
                    </div>
                  ))}
                  {sorted.length > 3 && (
                    <div style={{ fontSize: 9, color: '#6C7F94', padding: '1px 4px' }}>+{sorted.length - 3} altri</div>
                  )}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

/* ── Week View ── */

const HOUR_HEIGHT = 64 // px per ora
const FIRST_HOUR = 7
const LAST_HOUR = 23

const WeekView = ({
  baseDate, todayStr, eventsOnDate, onNewEvent, onClickEvent, isMobile,
}: {
  baseDate: Date; todayStr: string; isMobile: boolean
  eventsOnDate: (d: string) => Evento[]; onNewEvent: (d: string) => void; onClickEvent: (e: Evento) => void
}) => {
  const allWeekDays = getWeekDays(baseDate)
  // Su mobile mostra solo il giorno corrente (giornaliero)
  const weekDays = isMobile ? [baseDate] : allWeekDays
  const hours = Array.from({ length: LAST_HOUR - FIRST_HOUR }, (_, i) => FIRST_HOUR + i)
  const totalHeight = (LAST_HOUR - FIRST_HOUR) * HOUR_HEIGHT

  const scrollRef = useRef<HTMLDivElement>(null)
  const [nowMinutes, setNowMinutes] = useState<number>(() => {
    const n = new Date()
    return n.getHours() * 60 + n.getMinutes()
  })

  // Scroll all'ora corrente all'avvio
  useEffect(() => {
    if (scrollRef.current) {
      const nowH = new Date().getHours()
      const scrollTo = Math.max(0, (nowH - FIRST_HOUR - 1) * HOUR_HEIGHT)
      scrollRef.current.scrollTop = scrollTo
    }
  }, [])

  // Aggiorna linea ora corrente ogni minuto
  useEffect(() => {
    const interval = setInterval(() => {
      const n = new Date()
      setNowMinutes(n.getHours() * 60 + n.getMinutes())
    }, 60_000)
    return () => clearInterval(interval)
  }, [])

  const nowTop = ((nowMinutes - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT

  // Pre-calcola layout per ogni giorno
  const dayLayouts = useMemo(() => {
    return weekDays.map(d => {
      const dateStr = fmtDateISO(d)
      const dayEvents = eventsOnDate(dateStr)
      return { dateStr, events: layoutEvents(dayEvents) }
    })
  }, [weekDays, eventsOnDate])

  return (
    <div style={{ border: '1px solid #E5E7EB', backgroundColor: '#fff', display: 'flex', flexDirection: 'column' }}>
      {/* Day headers sticky */}
      <div style={{
        display: 'grid', gridTemplateColumns: `${isMobile ? '44px' : '52px'} repeat(${weekDays.length}, 1fr)`,
        borderBottom: '2px solid #E5E7EB',
        position: 'sticky', top: 0, backgroundColor: '#fff', zIndex: 10,
      }}>
        <div style={{ borderRight: '1px solid #E5E7EB' }} />
        {weekDays.map((d, i) => {
          const dateStr = fmtDateISO(d)
          const isToday = dateStr === todayStr
          const isSat = i === 5
          const isSun = i === 6
          return (
            <div
              key={i}
              style={{
                padding: '8px 4px',
                textAlign: 'center',
                borderRight: i < 6 ? '1px solid #F3F4F6' : 'none',
                backgroundColor: isToday ? '#F0F4FF' : 'transparent',
              }}
            >
              <div style={{ fontSize: 10, fontWeight: 700, color: isSun ? '#DC2626' : isSat ? '#6C7F94' : '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
                {GIORNI[i]}
              </div>
              <div style={{
                fontSize: 20, fontWeight: isToday ? 700 : 400,
                color: isToday ? '#fff' : isSun ? '#DC2626' : '#1A2332',
                width: 34, height: 34, display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
                backgroundColor: isToday ? '#1A2332' : 'transparent',
                borderRadius: '50%', marginTop: 2,
              }}>
                {d.getDate()}
              </div>
            </div>
          )
        })}
      </div>

      {/* Scrollable grid */}
      <div ref={scrollRef} style={{ overflowY: 'auto', maxHeight: isMobile ? 'calc(100vh - 220px)' : 640 }}>
        <div style={{ display: 'grid', gridTemplateColumns: `${isMobile ? '44px' : '52px'} repeat(${weekDays.length}, 1fr)`, position: 'relative' }}>

          {/* Colonna ore */}
          <div style={{ position: 'relative', borderRight: '1px solid #E5E7EB' }}>
            {hours.map(h => (
              <div
                key={h}
                style={{
                  height: HOUR_HEIGHT,
                  display: 'flex',
                  alignItems: 'flex-start',
                  justifyContent: 'flex-end',
                  paddingRight: 8,
                  paddingTop: 4,
                  fontSize: 10,
                  fontWeight: 600,
                  color: '#9CA3AF',
                  boxSizing: 'border-box',
                  borderBottom: '1px solid #F3F4F6',
                }}
              >
                {pad(h)}:00
              </div>
            ))}
          </div>

          {/* Colonne giorni */}
          {dayLayouts.map(({ dateStr, events }, di) => {
            const isToday = dateStr === todayStr
            const nowVisible = isToday && nowMinutes >= FIRST_HOUR * 60 && nowMinutes <= LAST_HOUR * 60

            return (
              <div
                key={di}
                style={{
                  position: 'relative',
                  height: totalHeight,
                  borderRight: di < 6 ? '1px solid #F3F4F6' : 'none',
                  backgroundColor: isToday ? '#FAFBFF' : 'transparent',
                  cursor: 'pointer',
                }}
                onDoubleClick={() => onNewEvent(dateStr)}
              >
                {/* Righe ore */}
                {hours.map((_, hi) => (
                  <div
                    key={hi}
                    style={{
                      position: 'absolute',
                      top: hi * HOUR_HEIGHT,
                      left: 0, right: 0,
                      height: HOUR_HEIGHT,
                      borderBottom: '1px solid #F3F4F6',
                      boxSizing: 'border-box',
                    }}
                  >
                    {/* Linea mezzora */}
                    <div style={{
                      position: 'absolute',
                      top: HOUR_HEIGHT / 2,
                      left: 0, right: 0,
                      borderBottom: '1px dashed #F3F4F6',
                    }} />
                  </div>
                ))}

                {/* Linea ora corrente */}
                {nowVisible && (
                  <div
                    style={{
                      position: 'absolute',
                      top: nowTop,
                      left: 0, right: 0,
                      zIndex: 5,
                      pointerEvents: 'none',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center' }}>
                      <div style={{ width: 8, height: 8, borderRadius: '50%', backgroundColor: '#DC2626', flexShrink: 0, marginLeft: -4 }} />
                      <div style={{ flex: 1, height: 2, backgroundColor: '#DC2626' }} />
                    </div>
                  </div>
                )}

                {/* Eventi */}
                {events.map(ev => {
                  const startMin = parseTimeToMinutes(ev.ora_inizio)
                  const endMin = parseTimeToMinutes(ev.ora_fine)
                  const clampedStart = Math.max(startMin, FIRST_HOUR * 60)
                  const clampedEnd = Math.min(endMin, LAST_HOUR * 60)
                  if (clampedEnd <= clampedStart) return null

                  const top = ((clampedStart - FIRST_HOUR * 60) / 60) * HOUR_HEIGHT
                  const height = Math.max(((clampedEnd - clampedStart) / 60) * HOUR_HEIGHT - 2, 18)
                  const durationMin = endMin - startMin

                  const colGap = 2
                  const totalCols = ev.colCount
                  const colWidth = totalCols > 1 ? `calc((100% - ${colGap * (totalCols + 1)}px) / ${totalCols})` : `calc(100% - 4px)`
                  const leftOffset = totalCols > 1
                    ? `calc(${colGap}px + ${ev.colIdx} * (100% - ${colGap * (totalCols + 1)}px) / ${totalCols} + ${ev.colIdx * colGap}px)`
                    : '2px'

                  return (
                    <div
                      key={ev.id}
                      onClick={e => { e.stopPropagation(); onClickEvent(ev) }}
                      style={{
                        position: 'absolute',
                        top,
                        left: leftOffset,
                        width: colWidth,
                        height,
                        backgroundColor: ev.colore || '#1A2332',
                        borderRadius: 3,
                        padding: '2px 5px',
                        overflow: 'hidden',
                        cursor: 'pointer',
                        zIndex: 3,
                        boxSizing: 'border-box',
                        borderLeft: `3px solid rgba(0,0,0,0.2)`,
                        boxShadow: '0 1px 3px rgba(0,0,0,0.15)',
                      }}
                      title={`${ev.titolo} · ${ev.ora_inizio}–${ev.ora_fine}`}
                    >
                      <div style={{ fontSize: 10, fontWeight: 700, color: '#fff', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        {ev.titolo}
                      </div>
                      {height >= 28 && (
                        <div style={{ fontSize: 9, color: 'rgba(255,255,255,0.85)', whiteSpace: 'nowrap' }}>
                          {ev.ora_inizio.slice(0, 5)}–{ev.ora_fine.slice(0, 5)}
                          {durationMin > 0 && ` · ${durationMin}min`}
                        </div>
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

/* ── Day Detail Panel ── */

const DayDetail = ({
  dateStr, events, onClose, onNew, onClickEvent,
}: {
  dateStr: string; events: Evento[]; onClose: () => void; onNew: () => void; onClickEvent: (e: Evento) => void
}) => {
  const dt = new Date(dateStr + 'T00:00:00')
  const label = dt.toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' })
  const sorted = [...events].sort((a, b) => a.ora_inizio.localeCompare(b.ora_inizio))

  return (
    <div style={{ marginTop: 20, border: '1px solid #E5E7EB', backgroundColor: '#fff', padding: '16px 24px' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
        <span style={{ fontSize: 13, fontWeight: 700, color: '#1A2332', textTransform: 'capitalize' }}>{label}</span>
        <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
          <Button size="sm" variant="ghost" onClick={onNew}><Plus style={{ width: 11, height: 11 }} /> Nuovo</Button>
          <button onClick={onClose} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 4, display: 'flex' }}><X style={{ width: 14, height: 14 }} /></button>
        </div>
      </div>
      {sorted.length === 0 ? (
        <div style={{ fontSize: 12, color: '#9CA3AF', padding: '16px 0', textAlign: 'center' }}>Nessun evento</div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          {sorted.map(ev => (
            <div
              key={ev.id}
              onClick={() => onClickEvent(ev)}
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 12px',
                border: '1px solid #F3F4F6', cursor: 'pointer', borderRadius: 4,
              }}
            >
              <div style={{ width: 4, height: 28, backgroundColor: ev.colore || '#1A2332', flexShrink: 0, borderRadius: 2 }} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: '#1A2332', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{ev.titolo}</div>
                <div style={{ fontSize: 11, color: '#6C7F94' }}>
                  {ev.ora_inizio} – {ev.ora_fine}
                  {ev.luogo ? ` · ${ev.luogo}` : ''}
                </div>
              </div>
              <span style={{ fontSize: 10, color: '#9CA3AF', textTransform: 'uppercase', letterSpacing: '0.06em', flexShrink: 0 }}>{TIPO_LABEL[ev.tipo]}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
