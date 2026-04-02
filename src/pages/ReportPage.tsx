import { useEffect, useState } from 'react'
import { BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, Legend } from 'recharts'
import { supabase } from '../lib/supabase'

const BRAND = '#005DEF'
const COLORS = ['#005DEF', '#7C3AED', '#15803D', '#C2410C', '#A16207', '#DC2626', '#0891B2']

interface OrePerProgetto { nome: string; ore: number }
interface SpesePerCategoria { categoria: string; totale: number }
interface SpesePerProgetto { nome: string; totale: number }

export const ReportPage = () => {
  const [oreProgetto, setOreProgetto]     = useState<OrePerProgetto[]>([])
  const [speseCategoria, setSpeseCategoria] = useState<SpesePerCategoria[]>([])
  const [speseProgetto, setSpeseProgetto] = useState<SpesePerProgetto[]>([])
  const [totOre, setTotOre]               = useState(0)
  const [totSpese, setTotSpese]           = useState(0)
  const [loading, setLoading]             = useState(true)

  useEffect(() => {
    const load = async () => {
      const [{ data: timeData }, { data: speseData }] = await Promise.all([
        supabase.from('time_entries').select('ore, progetti(nome)'),
        supabase.from('spese').select('importo, categoria, progetti(nome)'),
      ])

      const oreMap = new Map<string, number>()
      let sumOre = 0
      for (const r of (timeData ?? []) as any[]) {
        const nome = r.progetti?.nome ?? 'Senza progetto'
        oreMap.set(nome, (oreMap.get(nome) ?? 0) + Number(r.ore))
        sumOre += Number(r.ore)
      }
      setOreProgetto(Array.from(oreMap, ([nome, ore]) => ({ nome, ore: +ore.toFixed(1) })).sort((a, b) => b.ore - a.ore))
      setTotOre(sumOre)

      const catMap = new Map<string, number>()
      const projMap = new Map<string, number>()
      let sumSpese = 0
      for (const r of (speseData ?? []) as any[]) {
        const cat = r.categoria ?? 'altro'
        catMap.set(cat, (catMap.get(cat) ?? 0) + Number(r.importo))
        const pNome = r.progetti?.nome ?? 'Senza progetto'
        projMap.set(pNome, (projMap.get(pNome) ?? 0) + Number(r.importo))
        sumSpese += Number(r.importo)
      }
      setSpeseCategoria(Array.from(catMap, ([categoria, totale]) => ({ categoria, totale: +totale.toFixed(2) })))
      setSpeseProgetto(Array.from(projMap, ([nome, totale]) => ({ nome, totale: +totale.toFixed(2) })).sort((a, b) => b.totale - a.totale))
      setTotSpese(sumSpese)

      setLoading(false)
    }
    load()
  }, [])

  if (loading) return <div style={{ color: '#6C7F94', fontSize: 13 }}>Caricamento report...</div>

  const fmtEur = (v: number) => `€ ${v.toLocaleString('it-IT', { minimumFractionDigits: 0 })}`

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 28 }}>

      {/* Summary cards */}
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 8 }}>Ore totali registrate</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: BRAND }}>{totOre.toFixed(1)}h</div>
        </div>
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '20px 24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#6C7F94', marginBottom: 8 }}>Spese totali</div>
          <div style={{ fontSize: 28, fontWeight: 700, color: '#C2410C' }}>{fmtEur(totSpese)}</div>
        </div>
      </div>

      {/* Ore per progetto */}
      {oreProgetto.length > 0 && (
        <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '24px' }}>
          <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332', marginBottom: 20 }}>Ore per progetto</div>
          <ResponsiveContainer width="100%" height={300}>
            <BarChart data={oreProgetto} layout="vertical" margin={{ left: 120, right: 20, top: 0, bottom: 0 }}>
              <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
              <XAxis type="number" tick={{ fontSize: 12 }} />
              <YAxis type="category" dataKey="nome" tick={{ fontSize: 12 }} width={110} />
              <Tooltip formatter={(v) => [`${v}h`, 'Ore']} />
              <Bar dataKey="ore" fill={BRAND} radius={[0, 4, 4, 0]} />
            </BarChart>
          </ResponsiveContainer>
        </div>
      )}

      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 20 }}>
        {/* Spese per categoria */}
        {speseCategoria.length > 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332', marginBottom: 20 }}>Spese per categoria</div>
            <ResponsiveContainer width="100%" height={280}>
              <PieChart>
                <Pie data={speseCategoria} dataKey="totale" nameKey="categoria" cx="50%" cy="50%" outerRadius={100} label={({ name, percent }: { name?: string; percent?: number }) => `${name ?? ''} ${((percent ?? 0) * 100).toFixed(0)}%`} labelLine={false} fontSize={11}>
                  {speseCategoria.map((_, i) => <Cell key={i} fill={COLORS[i % COLORS.length]} />)}
                </Pie>
                <Tooltip formatter={(v) => [fmtEur(v as number), 'Totale']} />
                <Legend />
              </PieChart>
            </ResponsiveContainer>
          </div>
        )}

        {/* Spese per progetto */}
        {speseProgetto.length > 0 && (
          <div style={{ backgroundColor: '#fff', border: '1px solid #E5E7EB', padding: '24px' }}>
            <div style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.08em', color: '#1A2332', marginBottom: 20 }}>Spese per progetto</div>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={speseProgetto} margin={{ left: 20, right: 20, top: 0, bottom: 0 }}>
                <CartesianGrid strokeDasharray="3 3" stroke="#F3F4F6" />
                <XAxis dataKey="nome" tick={{ fontSize: 11 }} interval={0} angle={-25} textAnchor="end" height={60} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip formatter={(v) => [fmtEur(v as number), 'Totale']} />
                <Bar dataKey="totale" fill="#C2410C" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        )}
      </div>

      {oreProgetto.length === 0 && speseCategoria.length === 0 && (
        <div style={{ textAlign: 'center', padding: '64px 24px', color: '#6C7F94' }}>
          <p style={{ fontSize: 15, fontWeight: 600, color: '#1A2332', marginBottom: 6 }}>Nessun dato disponibile</p>
          <p style={{ fontSize: 13 }}>Registra ore e spese per visualizzare i report.</p>
        </div>
      )}
    </div>
  )
}
