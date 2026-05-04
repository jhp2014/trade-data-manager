"use client";

import { useState } from "react";
import styles from "./PeerTable.module.css";
import type { PeerStockMock } from "@/types/deck";
import {
  formatPercent,
  formatKrwShort,
  formatInt,
  riseFallClass,
} from "@/components/format/number";

interface Props {
  self: PeerStockMock;
  peers: PeerStockMock[];
}

const TOP_N = 5;

export function PeerTable({ self, peers }: Props) {
  const [expanded, setExpanded] = useState(false);
  const visiblePeers = expanded ? peers : peers.slice(0, TOP_N);
  const hidden = peers.length - TOP_N;

  return (
    <div>
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
          {visiblePeers.map((p) => (
            <Row key={p.stockCode} row={p} />
          ))}
        </tbody>
      </table>

      {hidden > 0 && (
        <button
          type="button"
          className={styles.moreBtn}
          onClick={() => setExpanded((v) => !v)}
        >
          {expanded ? "접기" : `+ ${hidden}개 더보기`}
        </button>
      )}
    </div>
  );
}

function Row({ row, self = false }: { row: PeerStockMock; self?: boolean }) {
  return (
    <tr className={self ? styles.selfRow : ""}>
      <td className={styles.nameCol}>
        {row.stockName}
        <span className={styles.codeCol}>{row.stockCode}</span>
      </td>
      <td className={`tabular ${riseFallClass(row.changeRate)}`}>
        {formatPercent(row.changeRate)}
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
