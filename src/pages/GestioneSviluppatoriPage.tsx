import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, UserCheck, Copy, Check, RefreshCw, User, Activity, Monitor, Smartphone, Tablet } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { sendNotification } from '../lib/notifications'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { FormField, Input } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'

const BRAND = '#005DEF'

type LogTab = 'accessi' | 'attivita' | 'task'

interface Developer {
  user_id: string
  email: string
  must_change_password: boolean
  lingua: 'it' | 'en'
  created_at: string
  last_access: string | null
  total_accesses: number
  projects: { id: string; nome: string }[]
  nome: string | null
  cognome: string | null
  telefono: string | null
  titolo: string | null
}

interface AccessEntry {
  id: string
  logged_in_at: string
  ip_address: string | null
  user_agent: string | null
}

interface AttivitaEntry {
  id: string
  azione: string
  dettaglio: string | null
  created_at: string
  progetto_nome: string | null
}

interface TaskEntry {
  id: string
  titolo: string
  stato: string
  priorita: string
  scadenza: string | null
  updated_at: string
  progetto_nome: string | null
}

interface Progetto {
  id: string
  nome: string
}

interface InviteResult {
  email: string
  temp_password: string
}

/* ─── Helpers ─── */

function parseDevice(ua: string | null): { label: string; Icon: typeof Monitor } {
  if (!ua) return { label: 'Sconosciuto', Icon: Monitor }
  const l = ua.toLowerCase()
  if (/mobile|android|iphone/.test(l)) return { label: 'Mobile', Icon: Smartphone }
  if (/ipad|tablet/.test(l)) return { label: 'Tablet', Icon: Tablet }
  return { label: 'Desktop', Icon: Monitor }
}

function parseBrowser(ua: string | null): string {
  if (!ua) return '—'
  if (ua.includes('Edg/')) return 'Edge'
  if (ua.includes('Chrome/')) return 'Chrome'
  if (ua.includes('Firefox/')) return 'Firefox'
  if (ua.includes('Safari/') && !ua.includes('Chrome')) return 'Safari'
  return 'Browser'
}

const fmtDateTime = (iso: string) =>
  new Date(iso).toLocaleString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' })

const statoColor: Record<string, string> = {
  todo: '#9CA3AF', in_progress: '#3B82F6', in_review: '#7C3AED', done: '#16A34A',
}
const prioritaColor: Record<string, string> = {
  bassa: '#9CA3AF', media: '#D97706', alta: '#2563EB', urgente: '#DC2626',
}

export const GestioneSviluppatoriPage = () => {
  const [developers, setDevelopers] = useState<Developer[]>([])
  const [progetti, setProgetti] = useState<Progetto[]>([])
  const [loading, setLoading] = useState(true)

  // Invite modal
  const [inviteModal, setInviteModal] = useState(false)
  const [inviteEmail, setInviteEmail] = useState('')
  const [inviteLingua, setInviteLingua] = useState<'it' | 'en'>('it')
  const [inviteProjects, setInviteProjects] = useState<string[]>([])
  const [inviting, setInviting] = useState(false)
  const [inviteError, setInviteError] = useState<string | null>(null)
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null)
  const [copied, setCopied] = useState(false)

  // Edit projects modal
  const [editModal, setEditModal] = useState(false)
  const [editDev, setEditDev] = useState<Developer | null>(null)
  const [editProjects, setEditProjects] = useState<string[]>([])
  const [editSaving, setEditSaving] = useState(false)

  // Revoke modal
  const [revokeId, setRevokeId] = useState<string | null>(null)
  const [revokeEmail, setRevokeEmail] = useState('')
  const [revoking, setRevoking] = useState(false)

  // Log modal
  const [logModal, setLogModal] = useState(false)
  const [logDev, setLogDev] = useState<Developer | null>(null)
  const [logTab, setLogTab] = useState<LogTab>('accessi')
  const [logAccessi, setLogAccessi] = useState<AccessEntry[]>([])
  const [logAttivita, setLogAttivita] = useState<AttivitaEntry[]>([])
  const [logTask, setLogTask] = useState<TaskEntry[]>([])
  const [logLoading, setLogLoading] = useState(false)

  // Info (profile) modal
  const [infoModal, setInfoModal] = useState(false)
  const [infoDev, setInfoDev] = useState<Developer | null>(null)
  const [infoNome, setInfoNome] = useState('')
  const [infoCognome, setInfoCognome] = useState('')
  const [infoTelefono, setInfoTelefono] = useState('')
  const [infoTitolo, setInfoTitolo] = useState('')
  const [, setInfoAzienda] = useState('')
  const [, setInfoPartitaIva] = useState('')
  const [infoSaving, setInfoSaving] = useState(false)

  const load = useCallback(async () => {
    setLoading(true)

    const [{ data: proj }, { data: profiles, error }, ] = await Promise.all([
      supabase.from('progetti').select('id, nome').order('nome'),
      supabase
        .from('developer_profiles')
        .select('user_id, email, must_change_password, lingua, created_at')
        .order('created_at', { ascending: false }),
    ])

    setProgetti(proj ?? [])

    if (error) {
      console.error(safeErrorMessage(error))
      setLoading(false)
      return
    }

    const profileList = profiles ?? []
    const userIds = profileList.map(p => p.user_id)

    // Get project memberships + user profiles + access log summary in parallel
    const [{ data: memberships }, { data: userProfiles }, { data: accessSummary }] = await Promise.all([
      userIds.length > 0
        ? supabase.from('project_members').select('user_id, progetti(id, nome)').in('user_id', userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('user_profiles').select('user_id, nome, cognome, telefono, ruolo').in('user_id', userIds)
        : Promise.resolve({ data: [] }),
      userIds.length > 0
        ? supabase.from('access_log').select('user_id, logged_in_at').in('user_id', userIds).order('logged_in_at', { ascending: false })
        : Promise.resolve({ data: [] }),
    ])

    const membershipMap: Record<string, { id: string; nome: string }[]> = {}
    for (const m of memberships ?? []) {
      const proj = (m as any).progetti
      if (!proj) continue
      if (!membershipMap[m.user_id]) membershipMap[m.user_id] = []
      membershipMap[m.user_id].push({ id: proj.id, nome: proj.nome })
    }

    const profileMap: Record<string, { nome: string | null; cognome: string | null; telefono: string | null; ruolo: string | null }> = {}
    for (const up of userProfiles ?? []) {
      profileMap[up.user_id] = { nome: up.nome ?? null, cognome: up.cognome ?? null, telefono: up.telefono ?? null, ruolo: up.ruolo ?? null }
    }

    const lastAccessMap: Record<string, string> = {}
    const accessCountMap: Record<string, number> = {}
    for (const a of accessSummary ?? []) {
      if (!lastAccessMap[a.user_id]) lastAccessMap[a.user_id] = a.logged_in_at
      accessCountMap[a.user_id] = (accessCountMap[a.user_id] ?? 0) + 1
    }

    const devs: Developer[] = profileList.map(p => ({
      user_id: p.user_id,
      email: p.email ?? '—',
      must_change_password: p.must_change_password,
      lingua: p.lingua ?? 'it',
      created_at: p.created_at,
      last_access: lastAccessMap[p.user_id] ?? null,
      total_accesses: accessCountMap[p.user_id] ?? 0,
      projects: membershipMap[p.user_id] ?? [],
      nome: profileMap[p.user_id]?.nome ?? null,
      cognome: profileMap[p.user_id]?.cognome ?? null,
      telefono: profileMap[p.user_id]?.telefono ?? null,
      titolo: profileMap[p.user_id]?.ruolo ?? null,
    }))

    setDevelopers(devs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const callEdgeFunction = async (body: object) => {
    const { data: respData, error } = await supabase.functions.invoke('manage-developer', { body })
    if (error) {
      return { ok: false, error: error.message }
    }
    return respData
  }

  const handleInvite = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!inviteEmail.trim()) return
    setInviteError(null)
    setInviting(true)

    const result = await callEdgeFunction({
      action: 'invite',
      email: inviteEmail.trim().toLowerCase(),
      project_ids: inviteProjects,
      lingua: inviteLingua,
    })

    setInviting(false)

    if (!result.ok) {
      setInviteError(result.error ?? 'Errore durante la creazione.')
      return
    }

    // Save lingua using user_id returned from edge function
    try {
      await supabase
        .from('developer_profiles')
        .update({ lingua: inviteLingua })
        .eq('user_id', result.user_id)
    } catch { /* non-blocking */ }

    const now = new Date().toLocaleDateString(inviteLingua === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    const isEn = inviteLingua === 'en'
    const devEmail = result.email

    // Send welcome email TO THE DEVELOPER with their credentials
    sendNotification({
      to: [devEmail],
      subject: isEn
        ? 'Welcome to Agentics — Your account is ready'
        : 'Benvenuto in Agentics — Il tuo account è pronto',
      params: {
        notification_label: isEn ? 'WELCOME' : 'BENVENUTO',
        email_title: isEn ? 'Your account is ready' : 'Il tuo account è pronto',
        email_subtitle: isEn
          ? 'Log in and start working on your projects'
          : 'Accedi e inizia a lavorare sui tuoi progetti',
        recipient_name: devEmail.split('@')[0],
        intro_text: isEn
          ? 'An account has been created for you on the Agentics platform. Below are your temporary credentials. You will be asked to change your password on first login and set up two-factor authentication.'
          : 'È stato creato un account per te sulla piattaforma Agentics. Di seguito le tue credenziali temporanee. Al primo accesso ti verrà chiesto di cambiare la password e configurare l\'autenticazione a due fattori.',
        update_type: isEn ? 'New Account' : 'Nuovo Account',
        subject: devEmail,
        reference_code: isEn ? 'Agentics Platform' : 'Piattaforma Agentics',
        date: now,
        status: isEn ? 'Active' : 'Attivo',
        message_body: isEn
          ? `<strong>Email:</strong> ${devEmail}<br><br><strong>Temporary password:</strong> ${result.temp_password}<br><br><strong>Important:</strong><br>1. Log in at <a href="https://agenticsrl.com">agenticsrl.com</a><br>2. You will be asked to set a new password (min 8 chars, uppercase, lowercase, number)<br>3. Set up two-factor authentication (2FA) — mandatory`
          : `<strong>Email:</strong> ${devEmail}<br><br><strong>Password temporanea:</strong> ${result.temp_password}<br><br><strong>Importante:</strong><br>1. Accedi su <a href="https://agenticsrl.com">agenticsrl.com</a><br>2. Ti verrà chiesto di impostare una nuova password (min 8 caratteri, maiuscole, minuscole, numero)<br>3. Configura l'autenticazione a due fattori (2FA) — obbligatoria`,
        next_steps: isEn
          ? 'Log in with the credentials above and follow the setup steps.'
          : 'Accedi con le credenziali qui sopra e segui i passaggi di configurazione.',
        cta_url: 'https://agenticsrl.com',
        cta_label: isEn ? 'Log in now →' : 'Accedi ora →',
        secondary_note: isEn
          ? 'This email contains your credentials. Do not share it.'
          : 'Questa email contiene le tue credenziali. Non condividerla.',
        footer_text: isEn
          ? 'Automatic notification — Agentics platform.'
          : 'Notifica automatica — piattaforma Agentics.',
      },
    })

    setInviteResult({ email: result.email, temp_password: result.temp_password })
    load()
  }

  const handleEditProjects = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!editDev) return
    setEditSaving(true)

    await callEdgeFunction({
      action: 'update_projects',
      user_id: editDev.user_id,
      project_ids: editProjects,
    })

    setEditSaving(false)
    setEditModal(false)
    setEditDev(null)
    load()
  }

  const handleRevoke = async () => {
    if (!revokeId) return
    setRevoking(true)

    await callEdgeFunction({
      action: 'revoke',
      user_id: revokeId,
    })

    setRevoking(false)
    setRevokeId(null)
    setRevokeEmail('')
    load()
  }

  const openEdit = (dev: Developer) => {
    setEditDev(dev)
    setEditProjects(dev.projects.map(p => p.id))
    setEditModal(true)
  }

  const openInfo = (dev: Developer) => {
    setInfoDev(dev)
    setInfoNome(dev.nome ?? '')
    setInfoCognome(dev.cognome ?? '')
    setInfoTelefono(dev.telefono ?? '')
    setInfoTitolo(dev.titolo ?? '')
    setInfoAzienda('')
    setInfoPartitaIva('')
    setInfoModal(true)
  }

  const saveInfo = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!infoDev) return
    setInfoSaving(true)
    await supabase.from('user_profiles').upsert({
      user_id: infoDev.user_id,
      nome: infoNome.trim() || null,
      cognome: infoCognome.trim() || null,
      telefono: infoTelefono.trim() || null,
      ruolo: infoTitolo.trim() || null,
    }, { onConflict: 'user_id' })
    setInfoSaving(false)
    setInfoModal(false)
    setInfoDev(null)
    load()
  }

  const openLog = async (dev: Developer) => {
    setLogDev(dev)
    setLogTab('accessi')
    setLogModal(true)
    setLogLoading(true)

    const [{ data: accessi }, { data: attivita }, { data: tasks }] = await Promise.all([
      supabase.from('access_log').select('id, logged_in_at, ip_address, user_agent').eq('user_id', dev.user_id).order('logged_in_at', { ascending: false }).limit(200),
      supabase.from('progetto_attivita').select('id, azione, dettaglio, created_at, progetti(nome)').eq('user_id', dev.user_id).order('created_at', { ascending: false }).limit(200),
      supabase.from('task').select('id, titolo, stato, priorita, scadenza, updated_at, progetti(nome)').ilike('assegnatario', `%${dev.email}%`).order('updated_at', { ascending: false }).limit(200),
    ])

    setLogAccessi(accessi ?? [])
    setLogAttivita((attivita ?? []).map((a: any) => ({ ...a, progetto_nome: a.progetti?.nome ?? null })))
    setLogTask((tasks ?? []).map((t: any) => ({ ...t, progetto_nome: t.progetti?.nome ?? null })))
    setLogLoading(false)
  }

  const openRevoke = (dev: Developer) => {
    setRevokeId(dev.user_id)
    setRevokeEmail(dev.email)
  }

  const toggleProject = (id: string, current: string[], set: (v: string[]) => void) => {
    set(current.includes(id) ? current.filter(x => x !== id) : [...current, id])
  }

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text)
    setCopied(true)
    setTimeout(() => setCopied(false), 2000)
  }

  const resetInviteModal = () => {
    setInviteModal(false)
    setInviteEmail('')
    setInviteLingua('it')
    setInviteProjects([])
    setInviteError(null)
    setInviteResult(null)
    setCopied(false)
  }

  const fmtDate = (d: string) => new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: '2-digit', year: 'numeric' })

  return (
    <div>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 24 }}>
        <p style={{ fontSize: 13, color: '#6C7F94', margin: 0 }}>
          Gestisci gli account developer e i loro accessi ai progetti.
        </p>
        <Button onClick={() => { resetInviteModal(); setInviteModal(true) }}>
          <Plus className="w-4 h-4" />
          Nuovo developer
        </Button>
      </div>

      {loading ? (
        <div style={{ fontSize: 13, color: '#6C7F94' }}>Caricamento...</div>
      ) : developers.length === 0 ? (
        <EmptyState
          icon={UserCheck}
          title="Nessun developer"
          description="Crea il primo account developer e assegnalo ai progetti."
          action={{ label: 'Nuovo developer', onClick: () => { resetInviteModal(); setInviteModal(true) } }}
        />
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
          {developers.map(dev => (
            <div key={dev.user_id} style={{
              backgroundColor: '#fff',
              border: '1px solid #E5E7EB',
              borderRadius: 10,
              padding: '16px 20px',
              display: 'flex',
              alignItems: 'flex-start',
              gap: 16,
            }}>
              {/* Avatar */}
              <div style={{
                width: 40, height: 40, borderRadius: '50%',
                backgroundColor: BRAND, color: '#fff',
                display: 'flex', alignItems: 'center', justifyContent: 'center',
                fontSize: 16, fontWeight: 700, flexShrink: 0,
              }}>
                {(dev.nome ?? dev.email)[0].toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 2 }}>
                  {(dev.nome || dev.cognome) && (
                    <span style={{ fontSize: 15, fontWeight: 700, color: '#1A2332' }}>
                      {[dev.nome, dev.cognome].filter(Boolean).join(' ')}
                    </span>
                  )}
                  {dev.titolo && (
                    <span style={{ fontSize: 11, fontWeight: 600, color: '#6C7F94', backgroundColor: '#F3F4F6', border: '1px solid #E5E7EB', borderRadius: 4, padding: '2px 8px' }}>
                      {dev.titolo}
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 13, color: '#6C7F94' }}>{dev.email}</span>
                  <span style={{
                    fontSize: 11, fontWeight: 600,
                    color: dev.lingua === 'en' ? '#7C3AED' : '#6C7F94',
                    backgroundColor: dev.lingua === 'en' ? '#F5F3FF' : '#F9FAFB',
                    border: `1px solid ${dev.lingua === 'en' ? '#DDD6FE' : '#E5E7EB'}`,
                    borderRadius: 4, padding: '2px 8px',
                  }}>
                    {dev.lingua === 'en' ? 'EN' : 'IT'}
                  </span>
                  {dev.must_change_password && (
                    <span style={{
                      fontSize: 11, fontWeight: 600, color: '#D97706',
                      backgroundColor: '#FEF3C7', border: '1px solid #FDE68A',
                      borderRadius: 4, padding: '2px 8px',
                    }}>
                      Attesa primo login
                    </span>
                  )}
                </div>
                <div style={{ display: 'flex', gap: 16, marginBottom: 10, flexWrap: 'wrap' }}>
                  <span style={{ fontSize: 12, color: '#9CA3AF' }}>Creato il {fmtDate(dev.created_at)}</span>
                  {dev.last_access && (
                    <span style={{ fontSize: 12, color: dev.total_accesses > 0 ? '#16A34A' : '#9CA3AF' }}>
                      · Ultimo accesso {fmtDateTime(dev.last_access)}
                    </span>
                  )}
                  {!dev.last_access && (
                    <span style={{ fontSize: 12, color: '#D97706' }}>· Mai effettuato l'accesso</span>
                  )}
                  {dev.total_accesses > 0 && (
                    <span style={{ fontSize: 12, color: '#6C7F94' }}>· {dev.total_accesses} accessi totali</span>
                  )}
                </div>

                {/* Projects */}
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                  {dev.projects.length === 0 ? (
                    <span style={{ fontSize: 12, color: '#9CA3AF', fontStyle: 'italic' }}>Nessun progetto assegnato</span>
                  ) : dev.projects.map(p => (
                    <span key={p.id} style={{
                      fontSize: 12, fontWeight: 500, color: BRAND,
                      backgroundColor: '#EFF6FF', border: '1px solid #BFDBFE',
                      borderRadius: 4, padding: '2px 8px',
                    }}>
                      {p.nome}
                    </span>
                  ))}
                </div>
              </div>

              {/* Actions */}
              <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                <button
                  onClick={() => openLog(dev)}
                  title="Visualizza log"
                  style={{
                    background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer',
                    color: '#6C7F94', padding: '7px 10px', display: 'flex',
                    alignItems: 'center', borderRadius: 6, fontSize: 12, fontWeight: 600, gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = BRAND }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6C7F94' }}
                >
                  <Activity style={{ width: 13, height: 13 }} />
                  Log
                </button>
                <button
                  onClick={() => openInfo(dev)}
                  title="Modifica profilo"
                  style={{
                    background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer',
                    color: '#6C7F94', padding: '7px 10px', display: 'flex',
                    alignItems: 'center', borderRadius: 6, fontSize: 12, fontWeight: 600, gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = BRAND }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6C7F94' }}
                >
                  <User style={{ width: 13, height: 13 }} />
                  Profilo
                </button>
                <button
                  onClick={() => openEdit(dev)}
                  title="Modifica progetti"
                  style={{
                    background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer',
                    color: '#6C7F94', padding: '7px 10px', display: 'flex',
                    alignItems: 'center', borderRadius: 6, fontSize: 12, fontWeight: 600, gap: 5,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = BRAND; e.currentTarget.style.color = BRAND }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.color = '#6C7F94' }}
                >
                  <RefreshCw style={{ width: 13, height: 13 }} />
                  Progetti
                </button>
                <button
                  onClick={() => openRevoke(dev)}
                  title="Revoca accesso"
                  style={{
                    background: 'none', border: '1px solid #E5E7EB', cursor: 'pointer',
                    color: '#DC2626', padding: '7px 10px', display: 'flex',
                    alignItems: 'center', borderRadius: 6,
                  }}
                  onMouseEnter={e => { e.currentTarget.style.borderColor = '#DC2626'; e.currentTarget.style.backgroundColor = '#FEF2F2' }}
                  onMouseLeave={e => { e.currentTarget.style.borderColor = '#E5E7EB'; e.currentTarget.style.backgroundColor = 'transparent' }}
                >
                  <Trash2 style={{ width: 14, height: 14 }} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Invite Modal */}
      <Modal open={inviteModal} onClose={resetInviteModal} title="Nuovo developer" width="480px">
        {inviteResult ? (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <div style={{
              backgroundColor: '#F0FDF4', border: '1px solid #BBF7D0',
              borderRadius: 8, padding: '16px 20px',
            }}>
              <p style={{ fontSize: 14, fontWeight: 600, color: '#166534', margin: '0 0 4px' }}>
                Account creato con successo!
              </p>
              <p style={{ fontSize: 13, color: '#166534', margin: 0 }}>
                Condividi queste credenziali con {inviteResult.email}
              </p>
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Email</label>
                <div style={{ fontSize: 14, color: '#1A2332', fontFamily: 'monospace', backgroundColor: '#F9FAFB', border: '1px solid #E5E7EB', borderRadius: 6, padding: '10px 14px' }}>
                  {inviteResult.email}
                </div>
              </div>
              <div>
                <label style={{ fontSize: 11, fontWeight: 700, color: '#6C7F94', textTransform: 'uppercase', letterSpacing: '0.08em', display: 'block', marginBottom: 4 }}>Password temporanea</label>
                <div style={{ display: 'flex', gap: 8 }}>
                  <div style={{
                    flex: 1, fontSize: 16, fontWeight: 700, color: '#1A2332',
                    fontFamily: 'monospace', backgroundColor: '#F9FAFB',
                    border: '1px solid #E5E7EB', borderRadius: 6, padding: '10px 14px',
                    letterSpacing: '0.1em',
                  }}>
                    {inviteResult.temp_password}
                  </div>
                  <button
                    onClick={() => copyToClipboard(inviteResult.temp_password)}
                    style={{
                      background: copied ? '#F0FDF4' : '#F9FAFB',
                      border: `1px solid ${copied ? '#BBF7D0' : '#E5E7EB'}`,
                      cursor: 'pointer', borderRadius: 6, padding: '0 14px',
                      display: 'flex', alignItems: 'center', gap: 6,
                      color: copied ? '#166534' : '#6C7F94',
                      fontSize: 12, fontWeight: 600,
                      transition: 'all 0.15s',
                    }}
                  >
                    {copied ? <Check style={{ width: 14, height: 14 }} /> : <Copy style={{ width: 14, height: 14 }} />}
                    {copied ? 'Copiato' : 'Copia'}
                  </button>
                </div>
              </div>
            </div>

            <p style={{ fontSize: 12, color: '#9CA3AF', margin: 0 }}>
              Al primo accesso il developer dovrà scegliere una nuova password. Questa password temporanea non verrà mostrata di nuovo.
            </p>

            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button onClick={resetInviteModal}>Chiudi</Button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleInvite} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <FormField label="Email" required>
              <Input
                type="email"
                value={inviteEmail}
                onChange={e => setInviteEmail(e.target.value)}
                placeholder="developer@esempio.com"
                required
              />
            </FormField>

            <FormField label="Lingua interfaccia">
              <div style={{ display: 'flex', gap: 8 }}>
                {([['it', 'Italiano'], ['en', 'English']] as const).map(([val, label]) => (
                  <button
                    key={val}
                    type="button"
                    onClick={() => setInviteLingua(val)}
                    style={{
                      flex: 1, padding: '9px 12px', fontSize: 13, fontWeight: 600,
                      border: `1px solid ${inviteLingua === val ? BRAND : '#E5E7EB'}`,
                      backgroundColor: inviteLingua === val ? '#EFF6FF' : '#fff',
                      color: inviteLingua === val ? BRAND : '#6C7F94',
                      borderRadius: 6, cursor: 'pointer', transition: 'all 0.15s',
                    }}
                  >
                    {label}
                  </button>
                ))}
              </div>
            </FormField>

            <div>
              <label style={{ fontSize: 13, fontWeight: 600, color: '#374151', display: 'block', marginBottom: 8 }}>
                Progetti assegnati
              </label>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 240, overflowY: 'auto' }}>
                {progetti.map(p => (
                  <label key={p.id} style={{
                    display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                    padding: '8px 12px', borderRadius: 6,
                    backgroundColor: inviteProjects.includes(p.id) ? '#EFF6FF' : '#F9FAFB',
                    border: `1px solid ${inviteProjects.includes(p.id) ? '#BFDBFE' : '#E5E7EB'}`,
                    transition: 'all 0.15s',
                  }}>
                    <input
                      type="checkbox"
                      checked={inviteProjects.includes(p.id)}
                      onChange={() => toggleProject(p.id, inviteProjects, setInviteProjects)}
                      style={{ width: 15, height: 15, accentColor: BRAND }}
                    />
                    <span style={{ fontSize: 13, color: '#1A2332' }}>{p.nome}</span>
                  </label>
                ))}
              </div>
            </div>

            {inviteError && (
              <div style={{
                fontSize: 13, color: '#DC2626', backgroundColor: '#FEF2F2',
                border: '1px solid #FECACA', borderRadius: 8, padding: '10px 14px',
              }}>
                {inviteError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={resetInviteModal}>Annulla</Button>
              <Button type="submit" disabled={inviting}>
                {inviting ? 'Creazione...' : 'Crea account'}
              </Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Edit Projects Modal */}
      <Modal open={editModal} onClose={() => { setEditModal(false); setEditDev(null) }} title="Modifica progetti" width="480px">
        {editDev && (
          <form onSubmit={handleEditProjects} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
            <p style={{ fontSize: 13, color: '#6C7F94', margin: 0 }}>
              Progetti assegnati a <strong>{editDev.email}</strong>
            </p>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 6, maxHeight: 280, overflowY: 'auto' }}>
              {progetti.map(p => (
                <label key={p.id} style={{
                  display: 'flex', alignItems: 'center', gap: 10, cursor: 'pointer',
                  padding: '8px 12px', borderRadius: 6,
                  backgroundColor: editProjects.includes(p.id) ? '#EFF6FF' : '#F9FAFB',
                  border: `1px solid ${editProjects.includes(p.id) ? '#BFDBFE' : '#E5E7EB'}`,
                  transition: 'all 0.15s',
                }}>
                  <input
                    type="checkbox"
                    checked={editProjects.includes(p.id)}
                    onChange={() => toggleProject(p.id, editProjects, setEditProjects)}
                    style={{ width: 15, height: 15, accentColor: BRAND }}
                  />
                  <span style={{ fontSize: 13, color: '#1A2332' }}>{p.nome}</span>
                </label>
              ))}
            </div>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
              <Button type="button" variant="ghost" onClick={() => { setEditModal(false); setEditDev(null) }}>Annulla</Button>
              <Button type="submit" disabled={editSaving}>{editSaving ? 'Salvataggio...' : 'Salva'}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Log Modal */}
      <Modal open={logModal} onClose={() => { setLogModal(false); setLogDev(null) }} title={logDev ? `Log — ${[logDev.nome, logDev.cognome].filter(Boolean).join(' ') || logDev.email}` : 'Log'} width="780px">
        {logDev && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 0 }}>

            {/* Summary bar */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 1, backgroundColor: '#E5E7EB', marginBottom: 20 }}>
              {[
                { label: 'Accessi totali', value: String(logDev.total_accesses) },
                { label: 'Ultimo accesso', value: logDev.last_access ? fmtDateTime(logDev.last_access) : '—' },
                { label: 'Task assegnati', value: String(logTask.length) },
              ].map(s => (
                <div key={s.label} style={{ backgroundColor: '#F9FAFB', padding: '12px 16px' }}>
                  <div style={{ fontSize: 10, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 4 }}>{s.label}</div>
                  <div style={{ fontSize: 16, fontWeight: 700, color: '#1A2332' }}>{logLoading ? '…' : s.value}</div>
                </div>
              ))}
            </div>

            {/* Tabs */}
            <div style={{ display: 'flex', gap: 0, borderBottom: '2px solid #E5E7EB', marginBottom: 16 }}>
              {([['accessi', 'Accessi'], ['attivita', 'Attività'], ['task', 'Task']] as [LogTab, string][]).map(([tab, label]) => (
                <button
                  key={tab}
                  onClick={() => setLogTab(tab)}
                  style={{
                    background: 'none', border: 'none', cursor: 'pointer',
                    padding: '8px 20px', fontSize: 13, fontWeight: 600,
                    color: logTab === tab ? BRAND : '#6C7F94',
                    borderBottom: logTab === tab ? `2px solid ${BRAND}` : '2px solid transparent',
                    marginBottom: -2, transition: 'all 0.15s',
                  }}
                >
                  {label}
                </button>
              ))}
            </div>

            {logLoading ? (
              <div style={{ padding: '40px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Caricamento...</div>
            ) : (
              <div style={{ maxHeight: 400, overflowY: 'auto' }}>

                {/* Tab: Accessi */}
                {logTab === 'accessi' && (
                  logAccessi.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Nessun accesso registrato</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                          {['Data e ora', 'Indirizzo IP', 'Dispositivo', 'Browser'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6C7F94' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logAccessi.map((a, i) => {
                          const { label, Icon } = parseDevice(a.user_agent)
                          return (
                            <tr key={a.id} style={{ borderBottom: i < logAccessi.length - 1 ? '1px solid #F3F4F6' : 'none', backgroundColor: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                              <td style={{ padding: '9px 14px', color: '#1A2332', fontVariantNumeric: 'tabular-nums' }}>{fmtDateTime(a.logged_in_at)}</td>
                              <td style={{ padding: '9px 14px', color: '#6C7F94', fontFamily: 'monospace', fontSize: 12 }}>{a.ip_address ?? '—'}</td>
                              <td style={{ padding: '9px 14px' }}>
                                <span style={{ display: 'flex', alignItems: 'center', gap: 5, color: '#374151' }}>
                                  <Icon style={{ width: 13, height: 13, color: '#6C7F94' }} />{label}
                                </span>
                              </td>
                              <td style={{ padding: '9px 14px', color: '#374151' }}>{parseBrowser(a.user_agent)}</td>
                            </tr>
                          )
                        })}
                      </tbody>
                    </table>
                  )
                )}

                {/* Tab: Attività */}
                {logTab === 'attivita' && (
                  logAttivita.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Nessuna attività registrata</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                          {['Data e ora', 'Azione', 'Dettaglio', 'Progetto'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6C7F94' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logAttivita.map((a, i) => (
                          <tr key={a.id} style={{ borderBottom: i < logAttivita.length - 1 ? '1px solid #F3F4F6' : 'none', backgroundColor: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '9px 14px', color: '#6C7F94', fontVariantNumeric: 'tabular-nums', whiteSpace: 'nowrap' }}>{fmtDateTime(a.created_at)}</td>
                            <td style={{ padding: '9px 14px', color: '#1A2332', fontWeight: 600 }}>{a.azione}</td>
                            <td style={{ padding: '9px 14px', color: '#6C7F94', maxWidth: 200, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{a.dettaglio ?? '—'}</td>
                            <td style={{ padding: '9px 14px', color: BRAND, fontWeight: 500 }}>{a.progetto_nome ?? '—'}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

                {/* Tab: Task */}
                {logTab === 'task' && (
                  logTask.length === 0 ? (
                    <div style={{ padding: '32px 0', textAlign: 'center', fontSize: 13, color: '#9CA3AF' }}>Nessun task assegnato</div>
                  ) : (
                    <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                      <thead>
                        <tr style={{ backgroundColor: '#F9FAFB', borderBottom: '1px solid #E5E7EB' }}>
                          {['Titolo', 'Progetto', 'Stato', 'Priorità', 'Scadenza', 'Aggiornato'].map(h => (
                            <th key={h} style={{ padding: '9px 14px', textAlign: 'left', fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.07em', color: '#6C7F94' }}>{h}</th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {logTask.map((t, i) => (
                          <tr key={t.id} style={{ borderBottom: i < logTask.length - 1 ? '1px solid #F3F4F6' : 'none', backgroundColor: i % 2 === 0 ? '#fff' : '#FAFAFA' }}>
                            <td style={{ padding: '9px 14px', color: '#1A2332', fontWeight: 600, maxWidth: 180, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{t.titolo}</td>
                            <td style={{ padding: '9px 14px', color: '#6C7F94' }}>{t.progetto_nome ?? '—'}</td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: statoColor[t.stato] ?? '#9CA3AF' }}>{t.stato.replace('_', ' ')}</span>
                            </td>
                            <td style={{ padding: '9px 14px' }}>
                              <span style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.06em', color: prioritaColor[t.priorita] ?? '#9CA3AF' }}>{t.priorita}</span>
                            </td>
                            <td style={{ padding: '9px 14px', color: '#6C7F94', whiteSpace: 'nowrap' }}>{t.scadenza ? new Date(t.scadenza).toLocaleDateString('it-IT') : '—'}</td>
                            <td style={{ padding: '9px 14px', color: '#9CA3AF', whiteSpace: 'nowrap', fontSize: 12 }}>{fmtDateTime(t.updated_at)}</td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  )
                )}

              </div>
            )}
          </div>
        )}
      </Modal>

      {/* Info / Profile Modal */}
      <Modal open={infoModal} onClose={() => { setInfoModal(false); setInfoDev(null) }} title="Profilo developer" width="480px">
        {infoDev && (
          <form onSubmit={saveInfo} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <p style={{ fontSize: 13, color: '#6C7F94', margin: 0 }}>
              Informazioni personali di <strong>{infoDev.email}</strong>
            </p>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <FormField label="Nome">
                <Input value={infoNome} onChange={e => setInfoNome(e.target.value)} placeholder="Es. Marco" />
              </FormField>
              <FormField label="Cognome">
                <Input value={infoCognome} onChange={e => setInfoCognome(e.target.value)} placeholder="Es. Rossi" />
              </FormField>
            </div>

            <FormField label="Ruolo / Titolo professionale">
              <Input value={infoTitolo} onChange={e => setInfoTitolo(e.target.value)} placeholder="Es. Frontend Developer, Full-Stack Engineer..." />
            </FormField>

            <FormField label="Telefono">
              <Input type="tel" value={infoTelefono} onChange={e => setInfoTelefono(e.target.value)} placeholder="+39 333 1234567" />
            </FormField>

            <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', marginTop: 4 }}>
              <Button type="button" variant="ghost" onClick={() => { setInfoModal(false); setInfoDev(null) }}>Annulla</Button>
              <Button type="submit" disabled={infoSaving}>{infoSaving ? 'Salvataggio...' : 'Salva'}</Button>
            </div>
          </form>
        )}
      </Modal>

      {/* Revoke Modal */}
      <Modal open={!!revokeId} onClose={() => { setRevokeId(null); setRevokeEmail('') }} title="Revoca accesso" width="380px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 8 }}>
          Sei sicuro di voler revocare l'accesso a <strong>{revokeEmail}</strong>?
        </p>
        <p style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 20 }}>
          L'account verrà eliminato definitivamente. L'utente non potrà più accedere.
        </p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => { setRevokeId(null); setRevokeEmail('') }}>Annulla</Button>
          <Button variant="danger" onClick={handleRevoke} disabled={revoking}>
            {revoking ? 'Revoca...' : 'Revoca accesso'}
          </Button>
        </div>
      </Modal>
    </div>
  )
}
