import { useEffect, useState } from 'react'
import { Plus, Pencil, Trash2, FolderOpen, ChevronRight } from 'lucide-react'
import { supabase } from '../lib/supabase'
import { progettoSchema, validate, type ValidationErrors } from '../lib/validation'
import { safeErrorMessage } from '../lib/errors'
import type { Progetto, Cliente, StatoProgetto } from '../types'
import { Button }     from '../components/ui/Button'
import { Badge }      from '../components/ui/Badge'
import { Modal }      from '../components/ui/Modal'
import { EmptyState } from '../components/ui/EmptyState'
import { useIsMobile } from '../hooks/useIsMobile'
import { useCurrentRole, useT } from '../hooks/useCurrentRole'
import { FormField, Input, Select, TextArea } from '../components/ui/FormField'
import { notifyProgettoPipelineAdvance } from '../lib/notifications'

const ADMIN_EMAIL = 'lorenzo@agentics.eu.com'

type Form = {
  cliente_id: string | null; nome: string; descrizione: string | null
  stato: StatoProgetto; data_inizio: string | null; data_fine: string | null
  budget: number | null; pagamento_mensile: number | null
  responsabile: string | null; team: string[]; priorita_progetto: string; marginalita_stimata: number | null
  commerciale: string | null; percentuale_commissione: number | null
  link_demo: string | null; link_deploy: string | null
}

const emptyCreate: Form = {
  cliente_id: null, nome: '', descrizione: null, stato: 'cliente_demo',
  data_inizio: null, data_fine: null, budget: null, pagamento_mensile: null,
  responsabile: null, team: [], priorita_progetto: 'media', marginalita_stimata: null,
  commerciale: null, percentuale_commissione: null,
  link_demo: null, link_deploy: null,
}

const fmtEur = (v: number | null) =>
  v != null ? `€ ${Number(v).toLocaleString('it-IT', { minimumFractionDigits: 2 })}` : '—'

const fmtDate = (d: string | null) =>
  d ? new Date(d).toLocaleDateString('it-IT', { day: '2-digit', month: 'short', year: 'numeric' }) : '—'

interface Props {
  onViewProgetto: (id: string) => void
}

export const ProgettiPage = ({ onViewProgetto }: Props) => {
  const isMobile = useIsMobile()
  const { role } = useCurrentRole()
  const t = useT()
  const isDeveloper = role === 'developer'

  const statoBadge: Record<StatoProgetto, { label: string; color: 'green' | 'blue' | 'yellow' | 'gray' | 'orange' }> = {
    cliente_demo:   { label: t('project_status.cliente_demo'),   color: 'yellow' },
    demo_accettata: { label: t('project_status.demo_accettata'), color: 'orange' },
    firmato:        { label: t('project_status.firmato'),        color: 'green' },
    completato:     { label: t('project_status.completato'),     color: 'blue' },
    archiviato:     { label: t('project_status.archiviato'),     color: 'gray' },
  }
  const [rows, setRows]         = useState<Progetto[]>([])
  const [clienti, setClienti]   = useState<Pick<Cliente, 'id' | 'nome'>[]>([])
  const [loading, setLoading]   = useState(true)
  const [modal, setModal]       = useState(false)
  const [editing, setEditing]   = useState<Progetto | null>(null)
  const [form, setForm]         = useState<Form>({ ...emptyCreate })
  const [saving, setSaving]     = useState(false)
  const [deleteId, setDeleteId] = useState<string | null>(null)
  const [errors, setErrors]     = useState<ValidationErrors>({})

  const load = async () => {
    const [{ data, error }, { data: cli }] = await Promise.all([
      supabase.from('progetti').select('*, clienti(nome)').order('created_at', { ascending: false }),
      supabase.from('clienti').select('id, nome').order('nome'),
    ])
    if (error) { console.error(safeErrorMessage(error)); return }
    setRows(data ?? [])
    setClienti(cli ?? [])
    setLoading(false)
  }

  useEffect(() => { load() }, [])

  const openNew = () => {
    setEditing(null)
    setForm({ ...emptyCreate })
    setErrors({})
    setModal(true)
  }

  const openEdit = (p: Progetto) => {
    setEditing(p)
    setForm({
      cliente_id: p.cliente_id, nome: p.nome, descrizione: p.descrizione,
      stato: p.stato, data_inizio: p.data_inizio, data_fine: p.data_fine,
      budget: p.budget, pagamento_mensile: p.pagamento_mensile,
      responsabile: p.responsabile, team: p.team ?? [],
      priorita_progetto: p.priorita_progetto ?? 'media',
      marginalita_stimata: p.marginalita_stimata,
      commerciale: p.commerciale ?? null,
      percentuale_commissione: p.percentuale_commissione ?? null,
      link_demo: p.link_demo ?? null,
      link_deploy: p.link_deploy ?? null,
    })
    setErrors({})
    setModal(true)
  }

  const save = async (e: React.FormEvent) => {
    e.preventDefault()
    const result = validate(progettoSchema, form)
    if (!result.success) { setErrors(result.errors); return }
    setErrors({}); setSaving(true)
    const { error } = editing
      ? await supabase.from('progetti').update(result.data).eq('id', editing.id)
      : await supabase.from('progetti').insert(result.data)
    if (error) { setErrors({ _form: safeErrorMessage(error) }); setSaving(false); return }

    // ── Notifica avanzamento pipeline ──────────────────────────────────────
    if (editing && form.stato !== editing.stato) {
      const clienteNome = clienti.find(c => c.id === form.cliente_id)?.nome ?? 'N/A'
      notifyProgettoPipelineAdvance({
        progettoNome: form.nome,
        progettoId: editing.id,
        statoPrecedente: editing.stato,
        statoNuovo: form.stato,
        cliente: clienteNome,
        pagamentoMensile: form.pagamento_mensile,
        adminEmail: ADMIN_EMAIL,
      })
    }
    // ───────────────────────────────────────────────────────────────────────

    setSaving(false); setModal(false)
    await load()
  }

  const remove = async () => {
    if (!deleteId) return
    await supabase.from('progetti').delete().eq('id', deleteId)
    setDeleteId(null)
    load()
  }

  const f = (k: keyof Form) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) =>
    setForm(p => ({ ...p, [k]: e.target.value }))

  const isEditing = editing !== null

  function renderForm() {
    return (
      <form onSubmit={save} style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
        {errors._form && <p style={{ fontSize: 12, color: '#DC2626' }}>{errors._form}</p>}

        <FormField label={t('projects.name')} required error={errors.nome}>
          <Input value={form.nome} onChange={f('nome')} placeholder={t('projects.name_ph')} maxLength={200} required />
        </FormField>

        <FormField label={t('projects.client')} error={errors.cliente_id}>
          <Select value={form.cliente_id ?? ''} onChange={f('cliente_id')}>
            <option value="">{t('projects.client_ph')}</option>
            {clienti.map(c => <option key={c.id} value={c.id}>{c.nome}</option>)}
          </Select>
        </FormField>

        <FormField label={t('projects.description')} error={errors.descrizione}>
          <TextArea value={form.descrizione ?? ''} onChange={f('descrizione')} placeholder={t('projects.description_ph')} maxLength={2000} />
        </FormField>

        <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
          <FormField label={t('projects.start_date')} error={errors.data_inizio}>
            <Input type="date" value={form.data_inizio ?? ''} onChange={f('data_inizio')} />
          </FormField>
          <FormField label={t('projects.end_date')} error={errors.data_fine}>
            <Input type="date" value={form.data_fine ?? ''} onChange={f('data_fine')} />
          </FormField>
        </div>

        {isEditing && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label={t('projects.status')} error={errors.stato}>
                <Select value={form.stato} onChange={f('stato')}>
                  <option value="cliente_demo">{t('project_status.cliente_demo')}</option>
                  <option value="demo_accettata">{t('project_status.demo_accettata')}</option>
                  <option value="firmato">{t('project_status.firmato')}</option>
                  <option value="completato">{t('project_status.completato')}</option>
                  <option value="archiviato">{t('project_status.archiviato')}</option>
                </Select>
              </FormField>
              <FormField label={t('projects.priority')} error={errors.priorita_progetto}>
                <Select value={form.priorita_progetto} onChange={f('priorita_progetto')}>
                  <option value="alta">{t('priority.alta')}</option>
                  <option value="media">{t('priority.media')}</option>
                  <option value="bassa">{t('priority.bassa')}</option>
                </Select>
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label={t('projects.payment')} error={errors.pagamento_mensile} hint={t('projects.payment_hint')}>
                <Input type="number" step="0.01" value={form.pagamento_mensile ?? ''} onChange={f('pagamento_mensile')} placeholder="0.00" />
              </FormField>
              <FormField label={t('projects.manager')} error={errors.responsabile}>
                <Input value={form.responsabile ?? ''} onChange={f('responsabile')} placeholder={t('projects.manager_ph')} />
              </FormField>
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: isMobile ? '1fr' : '1fr 1fr', gap: 16 }}>
              <FormField label="Commerciale" error={errors.commerciale} hint="Nome del commerciale che ha chiuso il contratto">
                <Input value={form.commerciale ?? ''} onChange={f('commerciale')} placeholder="Es. Mario Rossi" />
              </FormField>
              <FormField label="% Commissione" error={errors.percentuale_commissione} hint="Percentuale sul pagamento mensile">
                <Input type="number" step="0.1" min="0" max="100" value={form.percentuale_commissione ?? ''} onChange={f('percentuale_commissione')} placeholder="Es. 10" />
              </FormField>
            </div>
          </>
        )}

        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end', paddingTop: 8 }}>
          <Button type="button" variant="ghost" onClick={() => setModal(false)}>{t('common.cancel')}</Button>
          <Button type="submit" disabled={saving}>{saving ? t('common.saving') : isEditing ? t('projects.save_edit') : t('projects.create')}</Button>
        </div>
      </form>
    )
  }

  return (
    <div>
      {!isDeveloper && (
        <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: 20 }}>
          <Button onClick={openNew}><Plus className="w-3.5 h-3.5" />{t('projects.new')}</Button>
        </div>
      )}

      {loading
        ? <div style={{ color: '#6C7F94', fontSize: 13 }}>{t('common.loading')}</div>
        : rows.length === 0
          ? <EmptyState icon={FolderOpen} title={t('projects.empty')} description={t('projects.empty_desc')} action={isDeveloper ? undefined : { label: t('projects.new'), onClick: openNew }} />
          : isMobile ? (
            <div style={{ display: 'flex', flexDirection: 'column', border: '1px solid #E5E7EB', backgroundColor: '#fff' }}>
              {rows.map(p => {
                const b = statoBadge[p.stato]
                return (
                  <div key={p.id} style={{ padding: '14px 16px', borderBottom: '1px solid #F3F4F6' }}>
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8, marginBottom: 8 }}>
                      <div
                        onClick={() => onViewProgetto(p.id)}
                        style={{ fontSize: 14, fontWeight: 600, color: '#1A2332', flex: 1, minWidth: 0, lineHeight: 1.4, cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 4 }}
                      >
                        {p.nome}
                        <ChevronRight style={{ width: 12, height: 12, color: '#9CA3AF', flexShrink: 0 }} />
                      </div>
                      {!isDeveloper && (
                        <div style={{ display: 'flex', gap: 0, flexShrink: 0 }} onClick={e => e.stopPropagation()}>
                          <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: '8px', display: 'flex', borderRadius: 6 }} title={t('common.edit')}><Pencil className="w-4 h-4" /></button>
                          <button onClick={() => setDeleteId(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: '8px', display: 'flex', borderRadius: 6 }} title={t('common.delete')}><Trash2 className="w-4 h-4" /></button>
                        </div>
                      )}
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
                      <Badge label={b.label} color={b.color} />
                      {p.clienti?.nome && <span style={{ fontSize: 11, color: '#6C7F94' }}>{p.clienti.nome}</span>}
                      {p.pagamento_mensile != null && <span style={{ fontSize: 11, fontWeight: 600, color: '#1A2332' }}>{fmtEur(p.pagamento_mensile)}{t('projects.per_month')}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          ) : (
            <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', overflowX: 'auto', WebkitOverflowScrolling: 'touch' }}>
              <div style={{ minWidth: 640 }}>
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr 1fr 80px', padding: '10px 20px', borderBottom: '1px solid #E5E7EB', backgroundColor: '#F9FAFB' }}>
                {[t('task.project'), t('projects.client'), t('task.status'), t('projects.period'), t('projects.monthly_pay'), ''].map((h, i) => (
                  <span key={i} style={{ fontSize: 11, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94' }}>{h}</span>
                ))}
              </div>
              {rows.map(p => {
                const b = statoBadge[p.stato]
                const periodo = p.data_inizio
                  ? `${fmtDate(p.data_inizio)}${p.data_fine ? ` — ${fmtDate(p.data_fine)}` : ''}`
                  : '—'
                return (
                  <div
                    key={p.id}
                    onClick={() => onViewProgetto(p.id)}
                    style={{ display: 'grid', gridTemplateColumns: '2fr 1.2fr 0.8fr 1fr 1fr 80px', padding: '14px 20px', borderBottom: '1px solid #F3F4F6', alignItems: 'center', cursor: 'pointer', transition: 'background 0.1s' }}
                    onMouseEnter={e => (e.currentTarget.style.backgroundColor = '#F9FAFB')}
                    onMouseLeave={e => (e.currentTarget.style.backgroundColor = 'transparent')}
                  >
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: '#1A2332', display: 'flex', alignItems: 'center', gap: 6 }}>
                        {p.nome}
                        <ChevronRight style={{ width: 12, height: 12, color: '#9CA3AF' }} />
                      </div>
                      {p.descrizione && <div style={{ fontSize: 11, color: '#9CA3AF', marginTop: 2, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', maxWidth: 260 }}>{p.descrizione}</div>}
                    </div>
                    <span style={{ fontSize: 13, color: '#4B5563' }}>{p.clienti?.nome ?? '—'}</span>
                    <div><Badge label={b.label} color={b.color} /></div>
                    <span style={{ fontSize: 12, color: '#4B5563' }}>{periodo}</span>
                    <span style={{ fontSize: 13, fontWeight: 600, color: p.pagamento_mensile ? '#1A2332' : '#9CA3AF' }}>{fmtEur(p.pagamento_mensile)}</span>
                    {!isDeveloper && (
                      <div style={{ display: 'flex', gap: 6, justifyContent: 'flex-end' }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => openEdit(p)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#6C7F94', padding: 6, display: 'flex', borderRadius: 4 }} title={t('common.edit')}><Pencil className="w-3.5 h-3.5" /></button>
                        <button onClick={() => setDeleteId(p.id)} style={{ background: 'none', border: 'none', cursor: 'pointer', color: '#DC2626', padding: 6, display: 'flex', borderRadius: 4 }} title={t('common.delete')}><Trash2 className="w-3.5 h-3.5" /></button>
                      </div>
                    )}
                  </div>
                )
              })}
              </div>
            </div>
          )
      }

      <Modal open={modal} onClose={() => setModal(false)} title={isEditing ? t('projects.edit') : t('projects.new')} width={isMobile ? 'calc(100vw - 32px)' : '560px'}>
        {renderForm()}
      </Modal>

      <Modal open={!!deleteId} onClose={() => setDeleteId(null)} title={t('projects.delete')} width="360px">
        <p style={{ fontSize: 13, color: '#4B5563', marginBottom: 20 }}>{t('projects.delete_confirm')}</p>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'flex-end' }}>
          <Button variant="ghost" onClick={() => setDeleteId(null)}>{t('common.cancel')}</Button>
          <Button variant="danger" onClick={remove}>{t('common.delete')}</Button>
        </div>
      </Modal>
    </div>
  )
}
