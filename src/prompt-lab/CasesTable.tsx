import { CaseInputSummary } from './CaseContext';
import type { PromptLabCase } from './types';

export default function CasesTable({ cases, expandedId, onExpand, onChange }: {
  cases: PromptLabCase[];
  expandedId: string;
  onExpand: (id: string) => void;
  onChange: (id: string, update: (item: PromptLabCase) => PromptLabCase) => void;
}) {
  return <div className="plab-table-scroll"><table className="plab-data-table">
    <colgroup><col style={{ width: '20%' }} /><col style={{ width: '14%' }} /><col style={{ width: '40%' }} /><col style={{ width: '14%' }} /><col style={{ width: '12%' }} /></colgroup>
    <thead><tr><th>用例名称</th><th>分类</th><th>输入</th><th>上下文</th><th /></tr></thead>
    <tbody>{cases.map(c => <tr key={c.id}>
      <td><input aria-label="表格用例名称" value={c.name} onChange={e => onChange(c.id, item => ({ ...item, name: e.target.value }))} /></td>
      <td><input aria-label="表格用例分类" value={c.category} onChange={e => onChange(c.id, item => ({ ...item, category: e.target.value }))} /></td>
      <td><button className="plab-input-preview" onClick={() => onExpand(c.id)} title="查看完整指令">{c.turns[0] || '待填写指令'}</button></td><td><CaseInputSummary testCase={c} /></td>
      <td><button className="plab-button" onClick={() => onExpand(expandedId === c.id ? '' : c.id)}>编辑详情</button></td>
    </tr>)}</tbody>
  </table></div>;
}
