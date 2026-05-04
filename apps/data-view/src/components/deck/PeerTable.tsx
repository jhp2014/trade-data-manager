"use client";

import { useState } from "react";
import styles from "./PeerTable.module.css";
import type { StockMetricsDTO, ThemePeerGroupDTO } from "@/types/deck";
import {
  formatPercent,
  formatKrwShort,
  formatInt,
  riseFallClass,
} from "@/components/format/number";

interface Props {
  self: StockMetricsDTO;
  themeGroups: ThemePeerGroupDTO[];
}

const TOP_N = 5;

export function PeerTable({ self, themeGroups }: Props) {
  return (
    <table className={styles.table}>
      <thead>
        <tr>
          <th className={styles.nameCol}>종목</th>
          <th>등락률</th>
          <th>누적거래대금</th>
          <th>당일고점</th>
          <th>고점대비</th>
          <th>100억돌파</th>
        </tr>
      </thead>
      <tbody>
        <Row row={self} self />

        {themeGroups.length === 0 && (
          <tr>
            <td colSpan={6} className={styles.emptyPeer}>
              동반 종목 없음
            </td>
          </tr>
        )}

        {themeGroups.map((g) => (
          <ThemeSection key={g.themeId} group={g} />
        ))}
      </tbody>
    </table>
  );
}

function ThemeSection({ group }: { group: ThemePeerGroupDTO }) {
  const [expanded, setExpanded] = useState(false);
  const peers = group.peers;
  const visible = expanded ? peers : peers.slice(0, TOP_N);
  const hidden = peers.length - TOP_N;

  return (
    <>
      <tr className={styles.themeRow}>
        <td colSpan={6}>
          <span className={styles.themeLabel}>#{group.themeName}</span>
          <span className={styles.themeCount}>
            {peers.length}종목
          </span>
        </td>
      </tr>

      {peers.length === 0 && (
        <tr>
          <td colSpan={6} className={styles.emptyPeer}>
            같은 시점 데이터 없음
          </td>
        </tr>
      )}

      {visible.map((p) => (
        <Row key={p.stockCode} row={p} />
      ))}

      {hidden > 0 && (
        <tr>
          <td colSpan={6} className={styles.moreCell}>
            <button
              type="button"
              className={styles.moreBtn}
              onClick={(e) => {
                e.stopPropagation();
                setExpanded((v) => !v);
              }}
            >
              {expanded ? "접기" : `+ ${hidden}개 더보기`}
            </button>
          </td>
        </tr>
      )}
    </>
  );
}

function Row({ row, self = false }: { row: StockMetricsDTO; self?: boolean }) {
  return (
    <tr className={self ? styles.selfRow : ""}>
      <td className={styles.nameCol}>
        {row.stockName}
        <span className={styles.codeCol}>{row.stockCode}</span>
      </td>
      <td className={`tabular ${riseFallClass(row.closeRate)}`}>
        {formatPercent(row.closeRate)}
      </td>
      <td className="tabular">{formatKrwShort(row.cumulativeAmount)}</td>
      <td className={`tabular ${riseFallClass(row.dayHighRate)}`}>
        {formatPercent(row.dayHighRate)}
      </td>
      <td className={`tabular ${riseFallClass(row.pullbackFromHigh)}`}>
        {formatPercent(row.pullbackFromHigh)}
      </td>
      <td className="tabular">{formatInt(row.cnt100Amt)}</td>
    </tr>
  );
}
