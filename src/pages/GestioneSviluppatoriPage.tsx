import { useEffect, useState, useCallback } from 'react'
import { Plus, Trash2, UserCheck, Copy, Check, RefreshCw } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { safeErrorMessage } from '../lib/errors'
import { sendNotification } from '../lib/notifications'
import { Button } from '../components/ui/Button'
import { Modal } from '../components/ui/Modal'
import { FormField, Input } from '../components/ui/FormField'
import { EmptyState } from '../components/ui/EmptyState'

const BRAND = '#005DEF'

interface Developer {
  user_id: string
  email: string
  must_change_password: boolean
  lingua: 'it' | 'en'
  created_at: string
  projects: { id: string; nome: string }[]
}

interface Progetto {
  id: string
  nome: string
}

interface InviteResult {
  email: string
  temp_password: string
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

    // Get project memberships separately (no FK from developer_profiles to project_members)
    const { data: memberships } = userIds.length > 0
      ? await supabase
          .from('project_members')
          .select('user_id, progetti(id, nome)')
          .in('user_id', userIds)
      : { data: [] }

    const membershipMap: Record<string, { id: string; nome: string }[]> = {}
    for (const m of memberships ?? []) {
      const proj = (m as any).progetti
      if (!proj) continue
      if (!membershipMap[m.user_id]) membershipMap[m.user_id] = []
      membershipMap[m.user_id].push({ id: proj.id, nome: proj.nome })
    }

    const devs: Developer[] = profileList.map(p => ({
      user_id: p.user_id,
      email: p.email ?? '—',
      must_change_password: p.must_change_password,
      lingua: p.lingua ?? 'it',
      created_at: p.created_at,
      projects: membershipMap[p.user_id] ?? [],
    }))

    setDevelopers(devs)
    setLoading(false)
  }, [])

  useEffect(() => { load() }, [load])

  const callEdgeFunction = async (body: object) => {
    // Force token refresh before calling edge function
    await supabase.auth.refreshSession()
    const { data: { session } } = await supabase.auth.getSession()
    // #region agent log
    const exp = session?.access_token ? JSON.parse(atob(session.access_token.split('.')[1])).exp : null;
    const nowSec = Math.floor(Date.now() / 1000);
    console.log('[DEBUG-5e512b] callEdgeFunction session', { hasSession: !!session, hasToken: !!session?.access_token, tokenExp: exp, nowSec, expired: exp ? nowSec > exp : 'no-token', secondsLeft: exp ? exp - nowSec : null });
    // #endregion
    const res = await fetch(
      `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/manage-developer`,
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${session?.access_token}`,
          apikey: import.meta.env.VITE_SUPABASE_ANON_KEY,
        },
        body: JSON.stringify(body),
      }
    )
    // #region agent log
    console.log('[DEBUG-5e512b] manage-developer response', { status: res.status, ok: res.ok });
    // #endregion
    if (res.status === 401) {
      // #region agent log
      const errText = await res.clone().text();
      console.log('[DEBUG-5e512b] manage-developer 401 body', errText);
      // #endregion
    }
    return res.json()
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

    // #region agent log
    console.log('[DEBUG-5e512b] handleInvite result', { ok: result.ok, error: result.error, hasUserId: !!result.user_id, hasEmail: !!result.email, hasTempPw: !!result.temp_password });
    // #endregion

    if (!result.ok) {
      setInviteError(result.error ?? 'Errore durante la creazione.')
      return
    }

    // Save lingua using user_id returned from edge function
    try {
      const linguaRes = await supabase
        .from('developer_profiles')
        .update({ lingua: inviteLingua })
        .eq('user_id', result.user_id)
      // #region agent log
      console.log('[DEBUG-5e512b] lingua update', { status: linguaRes.status, error: linguaRes.error?.message });
      // #endregion
    } catch { /* non-blocking */ }

    const { data: { user: currentUser } } = await supabase.auth.getUser()
    const adminEmail = currentUser?.email ?? 'lorenzo@agentics.eu.com'
    const now = new Date().toLocaleDateString(inviteLingua === 'en' ? 'en-GB' : 'it-IT', { day: '2-digit', month: 'short', year: 'numeric' })
    const isEn = inviteLingua === 'en'

    // Fire-and-forget: don't block UI on notification
    sendNotification({
      to: [adminEmail],
      subject: isEn
        ? `New developer created: ${result.email}`
        : `Nuovo sviluppatore creato: ${result.email}`,
      params: {
        notification_label: isEn ? 'NEW DEVELOPER' : 'NUOVO SVILUPPATORE',
        email_title: isEn ? 'Developer account created' : 'Account developer creato',
        email_subtitle: isEn
          ? `Initial credentials for ${result.email}`
          : `Credenziali iniziali per ${result.email}`,
        recipient_name: 'Admin',
        intro_text: isEn
          ? 'A new developer account has been created. Below are the initial credentials. The password must be changed on first login.'
          : 'È stato creato un nuovo account sviluppatore nel gestionale. Di seguito le credenziali iniziali. La password dovrà essere cambiata al primo accesso.',
        update_type: isEn ? 'Account Created' : 'Account Creato',
        subject: result.email,
        reference_code: `${isEn ? 'Language' : 'Lingua'}: ${isEn ? 'English' : 'Italiano'}`,
        date: now,
        status: isEn ? 'Active' : 'Attivo',
        message_body: isEn
          ? `<strong>Email:</strong> ${result.email}<br><br><strong>Temporary password:</strong> ${result.temp_password}<br><br>The developer must change the password on first login and set up two-factor authentication.`
          : `<strong>Email:</strong> ${result.email}<br><br><strong>Password temporanea:</strong> ${result.temp_password}<br><br>Lo sviluppatore dovrà cambiare la password al primo accesso e configurare l'autenticazione a due fattori.`,
        next_steps: isEn
          ? 'Share the credentials with the developer securely. On first login they will be asked to set a new password.'
          : 'Comunica le credenziali allo sviluppatore in modo sicuro. Al primo login gli verrà richiesto di impostare una nuova password.',
        cta_url: 'https://agenticsrl.com',
        cta_label: isEn ? 'Open Dashboard →' : 'Apri il Gestionale →',
        secondary_note: isEn
          ? 'This email contains sensitive credentials. Do not forward it.'
          : 'Questa email contiene credenziali sensibili. Non inoltrarla.',
        footer_text: isEn
          ? 'Automatic notification — account creation — Agentics dashboard.'
          : 'Notifica automatica creazione account — gestionale Agentics.',
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
                {dev.email[0].toUpperCase()}
              </div>

              {/* Info */}
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap', marginBottom: 4 }}>
                  <span style={{ fontSize: 14, fontWeight: 600, color: '#1A2332' }}>{dev.email}</span>
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
                <div style={{ fontSize: 12, color: '#9CA3AF', marginBottom: 10 }}>
                  Creato il {fmtDate(dev.created_at)}
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
