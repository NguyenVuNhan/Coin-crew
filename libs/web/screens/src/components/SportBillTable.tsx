import { formatVnd } from '@cc/core';
import { useT } from '@cc/web-i18n';
import { Amount } from '@cc/web-ui/components/Amount';
import type { SportBillCalc } from '../lib/sportBill';

export function SportBillTable({
  calc,
  total,
  meId,
}: {
  calc: SportBillCalc;
  total: number;
  meId: string | null;
}) {
  const t = useT();

  const costSummary = [
    calc.court > 0 ? `${t('sport.court')}: ${formatVnd(calc.court)}` : null,
    calc.shuttlecocksTotal > 0 ? `${t('sport.shuttlecocks')}: ${formatVnd(calc.shuttlecocksTotal)}` : null,
    calc.extra > 0 ? `${t('sport.extra')}: ${formatVnd(calc.extra)}` : null,
  ].filter(Boolean).join(' · ');

  return (
    <div className="fsl-sport-table-container bg-card border border-border rounded-xl overflow-hidden">
      <table className="fsl-sport-table w-full table-fixed border-collapse text-sm text-left">
        <colgroup>
          <col />
          <col className="w-12" />
          <col className="w-12" />
          <col className="w-28" />
        </colgroup>
        <thead>
          <tr className="bg-muted text-muted-foreground text-xs font-semibold">
            <th scope="col" className="pl-3 pr-2 py-3 border-b border-border">{t('sport.tableColName')}</th>
            <th scope="col" className="fsl-sport-table__col--center px-2 py-3 border-b border-border text-center">{t('sport.tableColFemale')}</th>
            <th scope="col" className="fsl-sport-table__col--center px-2 py-3 border-b border-border text-center">{t('sport.tableColMale')}</th>
            <th scope="col" className="fsl-sport-table__col--right pl-2 pr-3 py-3 border-b border-border text-right whitespace-nowrap">{t('sport.tableColAmount')}</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {calc.participants.map((p) => {
            const isMe = p.participantId === meId;
            const displayName = isMe ? t('details.you', { name: p.name }) : p.name;
            const isFixed = p.fixedAmount !== null && p.fixedAmount !== undefined;
            return (
              <tr key={p.participantId} className="hover:bg-muted/50">
                <td className="pl-3 pr-2 py-3 border-b border-border break-words">
                  <span>{displayName}</span>
                  {isFixed && (
                    <span className="fsl-sport-table__fixed text-xs text-muted-foreground"> ({t('sport.fixedBadge')})</span>
                  )}
                </td>
                <td className="fsl-sport-table__col--center fsl-num px-2 py-3 border-b border-border text-center tabular-nums">
                  {p.femaleSlots > 0 ? p.femaleSlots : '—'}
                </td>
                <td className="fsl-sport-table__col--center fsl-num px-2 py-3 border-b border-border text-center tabular-nums">
                  {p.maleSlots > 0 ? p.maleSlots : '—'}
                </td>
                <td className="fsl-sport-table__col--right fsl-num pl-2 pr-3 py-3 border-b border-border text-right tabular-nums whitespace-nowrap">
                  <Amount value={p.amount} />
                </td>
              </tr>
            );
          })}
        </tbody>
        <tfoot>
          <tr className="fsl-sport-table__row--total-slots bg-warning-soft text-warning-foreground font-semibold">
            <th scope="row" className="pl-3 pr-2 py-3 border-b border-border font-semibold">{t('sport.tableTotalSlots')}</th>
            <td className="fsl-sport-table__col--center fsl-num px-2 py-3 border-b border-border text-center tabular-nums font-semibold">{calc.totalFemaleSlots}</td>
            <td className="fsl-sport-table__col--center fsl-num px-2 py-3 border-b border-border text-center tabular-nums font-semibold">{calc.totalMaleSlots}</td>
            <td className="fsl-sport-table__col--right fsl-num pl-2 pr-3 py-3 border-b border-border text-right tabular-nums font-semibold whitespace-nowrap">
              {calc.totalFemaleSlots + calc.totalMaleSlots} {t('split.mode.shares').toLowerCase()}
            </td>
          </tr>
          <tr className="fsl-sport-table__row--costs bg-muted/60 text-foreground">
            <th scope="row" colSpan={3} className="pl-3 pr-2 py-3 border-b border-border font-semibold">
              <div>{t('sport.tableCosts')}</div>
              <div className="fsl-sport-table__cost-summary text-xs text-muted-foreground font-normal">
                {costSummary}
              </div>
            </th>
            <td className="fsl-sport-table__col--right fsl-num pl-2 pr-3 py-3 border-b border-border text-right tabular-nums font-semibold whitespace-nowrap">
              <Amount value={total} />
            </td>
          </tr>
          <tr className="fsl-sport-table__row--per-slot bg-warning-soft text-warning-foreground font-semibold">
            <th scope="row" className="pl-3 pr-2 py-3 border-b border-border font-semibold">{t('sport.tablePerSlot')}</th>
            <td colSpan={3} className="fsl-sport-table__col--right pl-2 pr-3 py-3 border-b border-border text-right tabular-nums">
              {calc.totalFemaleSlots > 0 && (
                <span className="whitespace-nowrap">
                  {t('sport.tableColFemale')} <Amount value={calc.femaleSlotRate} />
                </span>
              )}
              {calc.totalFemaleSlots > 0 && calc.totalMaleSlots > 0 && ' · '}
              {calc.totalMaleSlots > 0 && (
                <span className="whitespace-nowrap">
                  {t('sport.tableColMale')} <Amount value={calc.maleSlotRate} />
                </span>
              )}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}
