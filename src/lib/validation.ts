import { z } from 'zod'

const MAX_TEXT = 500
const MAX_NAME = 200
const MAX_NOTE = 2000

const trimmed = z.string().transform(s => s.trim())

const nome = trimmed.pipe(z.string().min(1, 'Campo obbligatorio').max(MAX_NAME, `Massimo ${MAX_NAME} caratteri`))

const optionalText = trimmed.pipe(
  z.string().max(MAX_TEXT, `Massimo ${MAX_TEXT} caratteri`),
).transform(v => v || null).nullable()

const optionalNote = trimmed.pipe(
  z.string().max(MAX_NOTE, `Massimo ${MAX_NOTE} caratteri`),
).transform(v => v || null).nullable()

const optionalEmail = trimmed.pipe(
  z.string().max(MAX_TEXT).email('Email non valida').or(z.literal('')),
).transform(v => v || null).nullable()

const optionalPhone = trimmed.pipe(
  z.string().max(30, 'Massimo 30 caratteri').regex(/^[+\d\s\-().]*$/, 'Formato telefono non valido').or(z.literal('')),
).transform(v => v || null).nullable()

const optionalUuid = z.string().uuid().nullable().or(z.literal('').transform(() => null))

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Formato data non valido')

const positiveNumber = z.coerce.number().positive('Deve essere positivo').finite()

const optionalPiva = trimmed.pipe(
  z.string().max(20, 'Massimo 20 caratteri').regex(/^[0-9]*$/, 'Solo cifre').or(z.literal('')),
).transform(v => v || null).nullable()

const optionalCf = trimmed.pipe(
  z.string().max(20, 'Massimo 20 caratteri').regex(/^[A-Z0-9]*$/i, 'Formato non valido').or(z.literal('')),
).transform(v => v ? v.toUpperCase() : null).nullable()

const optionalSdi = trimmed.pipe(
  z.string().max(7, 'Massimo 7 caratteri').regex(/^[A-Z0-9]*$/i, 'Formato non valido').or(z.literal('')),
).transform(v => v ? v.toUpperCase() : null).nullable()

const optionalCap = trimmed.pipe(
  z.string().max(10, 'Massimo 10 caratteri').or(z.literal('')),
).transform(v => v || null).nullable()

const optionalProvincia = trimmed.pipe(
  z.string().max(5, 'Massimo 5 caratteri').or(z.literal('')),
).transform(v => v ? v.toUpperCase() : null).nullable()

const optionalUrl = trimmed.pipe(
  z.string().max(MAX_TEXT).url('URL non valido').or(z.literal('')),
).transform(v => v || null).nullable()

export const clienteSchema = z.object({
  nome,
  partita_iva: optionalPiva,
  codice_fiscale: optionalCf,
  codice_sdi: optionalSdi,
  pec: optionalEmail,
  indirizzo_sede: optionalText,
  cap: optionalCap,
  citta: optionalText,
  provincia: optionalProvincia,
  nazione: optionalText,
  sito_web: optionalUrl,
  settore: optionalText,
  email: optionalEmail,
  telefono: optionalPhone,
  note: optionalNote,
})

const optionalAmount = z.coerce.number().nonnegative('Non può essere negativo').finite().nullable()
  .or(z.literal('').transform(() => null))
  .or(z.literal(0).transform(() => null))

export const progettoSchema = z.object({
  nome,
  cliente_id: optionalUuid,
  descrizione: optionalNote,
  stato: z.enum(['cliente_demo', 'demo_accettata', 'firmato', 'completato', 'archiviato']),
  data_inizio: isoDate.nullable().or(z.literal('').transform(() => null)),
  data_fine: isoDate.nullable().or(z.literal('').transform(() => null)),
  budget: optionalAmount,
  pagamento_mensile: optionalAmount,
  responsabile: optionalText,
  team: z.array(z.string()).default([]),
  priorita_progetto: z.enum(['alta', 'media', 'bassa']).default('media'),
  marginalita_stimata: optionalAmount,
  link_demo: optionalUrl,
  link_deploy: optionalUrl,
})

const categoriaTask = z.enum([
  'sviluppo_frontend','sviluppo_backend','sviluppo_api','sviluppo_ai',
  'design_ui','design_ux','design_componenti',
  'infra_hosting','infra_database','infra_deploy','infra_dns',
  'security_auth','security_authz','security_test','security_api',
  'analytics_tracking','analytics_dashboard','analytics_metriche',
  'docs_manuali','docs_specifiche','docs_guide',
]).nullable().or(z.literal('').transform(() => null))

export const taskSchema = z.object({
  titolo: nome,
  progetto_id: optionalUuid,
  descrizione: optionalNote,
  stato: z.enum(['todo', 'in_progress', 'in_review', 'done']),
  priorita: z.enum(['bassa', 'media', 'alta', 'urgente']),
  scadenza: isoDate.nullable().or(z.literal('').transform(() => null)),
  categoria: categoriaTask,
  assegnatario: optionalText,
  dipendenza_id: optionalUuid,
  checklist: z.array(z.object({ testo: z.string(), completato: z.boolean() })).default([]),
  commenti: z.array(z.object({ autore: z.string(), testo: z.string(), timestamp: z.string() })).default([]),
})

export const progettoNotaSchema = z.object({
  titolo: nome,
  contenuto: optionalNote,
  autore: trimmed.pipe(z.string().min(1, 'Campo obbligatorio').max(MAX_NAME)),
})

export const progettoContrattoSchema = z.object({
  valore_progetto: optionalAmount,
  setup_iniziale: optionalAmount,
  pagamento_mensile: optionalAmount,
  durata_mesi: z.coerce.number().int().min(1).max(120).nullable()
    .or(z.literal('').transform(() => null)),
  data_firma: isoDate.nullable().or(z.literal('').transform(() => null)),
  data_scadenza_contratto: isoDate.nullable().or(z.literal('').transform(() => null)),
  rinnovo_automatico: z.boolean().default(false),
  preavviso_disdetta_giorni: z.coerce.number().int().min(0).max(365).nullable()
    .or(z.literal('').transform(() => null)),
  stato_pagamento: z.enum(['da_fatturare', 'parziale', 'saldato']).default('da_fatturare'),
  metodo_pagamento: z.enum(['bonifico', 'contanti', 'carta', 'assegno', 'riba', 'altro'])
    .nullable().or(z.literal('').transform(() => null)),
  giorno_fatturazione: z.coerce.number().int().min(1).max(31).nullable()
    .or(z.literal('').transform(() => null)),
  milestone: z.array(z.object({
    descrizione: z.string(),
    importo: z.number().nonnegative(),
    data: z.string(),
    stato: z.enum(['pending', 'completato', 'fatturato']),
  })).default([]),
  scadenze_fatturazione: z.array(z.object({
    data: z.string(),
    importo: z.number().nonnegative(),
    nota: z.string(),
  })).default([]),
  note: optionalNote,
})

export const timeEntrySchema = z.object({
  progetto_id: optionalUuid,
  task_id: optionalUuid,
  data: isoDate,
  ore: z.coerce.number().min(0.25, 'Minimo 0.25 ore').max(24, 'Massimo 24 ore').finite(),
  nota: optionalNote,
})

export const spesaSchema = z.object({
  progetto_id: optionalUuid,
  data: isoDate,
  categoria: z.enum(['software', 'hardware', 'servizi', 'trasferta', 'altro']),
  importo: positiveNumber.pipe(z.number().max(999_999_999, 'Importo troppo elevato')),
  descrizione: trimmed.pipe(z.string().min(1, 'Campo obbligatorio').max(MAX_TEXT)),
})

const optionalDate = isoDate.nullable().or(z.literal('').transform(() => null))

const nonNegativeAmount = z.coerce.number().nonnegative('Deve essere >= 0').max(999_999_999, 'Importo troppo elevato').finite()

const metodoPagamento = z.enum(['bonifico', 'contanti', 'carta', 'assegno', 'riba', 'altro'])
  .nullable().or(z.literal('').transform(() => null))

export const fatturaEmessaSchema = z.object({
  cliente_id: optionalUuid,
  numero_fattura: trimmed.pipe(z.string().min(1, 'Campo obbligatorio').max(50, 'Massimo 50 caratteri')),
  data_emissione: isoDate,
  data_scadenza: optionalDate,
  imponibile: nonNegativeAmount,
  aliquota_iva: z.coerce.number().min(0, 'Min 0%').max(100, 'Max 100%').finite(),
  stato: z.enum(['bozza', 'emessa', 'pagata', 'scaduta', 'annullata']),
  metodo_pagamento: metodoPagamento,
  data_pagamento: optionalDate,
  note: optionalNote,
})

export const fatturaRicevutaSchema = z.object({
  fornitore: nome,
  fornitore_piva: optionalPiva,
  numero_fattura: trimmed.pipe(z.string().min(1, 'Campo obbligatorio').max(50, 'Massimo 50 caratteri')),
  data_emissione: isoDate,
  data_scadenza: optionalDate,
  imponibile: nonNegativeAmount,
  aliquota_iva: z.coerce.number().min(0, 'Min 0%').max(100, 'Max 100%').finite(),
  stato: z.enum(['da_pagare', 'pagata', 'scaduta', 'annullata']),
  metodo_pagamento: metodoPagamento,
  data_pagamento: optionalDate,
  categoria: z.enum(['software', 'hardware', 'servizi', 'consulenza', 'affitto', 'utenze', 'altro']),
  note: optionalNote,
})

export const progettoCredenzialeSchema = z.object({
  nome: nome,
  tipo: z.enum(['account', 'api_key', 'database', 'server', 'certificato', 'altro']),
  url: optionalUrl,
  username: optionalText,
  password_encrypted: optionalText,
  api_key: optionalText,
  note: optionalNote,
})

export type ValidationErrors = Record<string, string>

export function validate<T>(schema: z.ZodSchema<T>, data: unknown): { success: true; data: T } | { success: false; errors: ValidationErrors } {
  const result = schema.safeParse(data)
  if (result.success) return { success: true, data: result.data }

  const errors: ValidationErrors = {}
  for (const issue of result.error.issues) {
    const key = issue.path.join('.')
    if (!errors[key]) errors[key] = issue.message
  }
  return { success: false, errors }
}
