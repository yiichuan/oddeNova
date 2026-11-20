import { Fragment, useId, useState } from 'react';

const fields = [
  ['key', '采样名称', '目录标题行中的合法采样名，例如 808。'],
  ['category', '目录类别', '目录标题行中的原始类别，用于判断乐器或声源。'],
  ['variantId', '文件标识', '模型用它返回选中的文件，例如 v123。'],
  ['index', '变体编号', '采样名后的编号，例如 808:0 中的 0。'],
  ['rootNote', '根音或试听音高', '采样文件的根音，或渲染音色使用的试听音高。'],
  ['articulation', '奏法', '录制时的演奏方式，例如断奏、揉音或弓奏。'],
  ['event_form', '发声形态', '声音是单次发声、重复事件、乐句还是持续纹理。'],
  ['pitchedness', '音高性', '声音是否有可辨音高，或主要呈现为噪声。'],
  ['brightness', '亮度', '听起来偏暗、均衡还是明亮。'],
  ['body', '厚度', '声音听起来轻薄、均衡还是厚实。'],
  ['texture_tags', '质感', '如金属感、气息感或颗粒感。多个标签用逗号分隔。'],
  ['distortion', '失真', '能否听到明显的失真。'],
  ['attack', '起音', '声音如何开始，例如锐利、圆润或渐起。'],
  ['shape', '变化形态', '声音响起后如何变化，例如自然衰减或保持。'],
  ['tail', '尾音', '声音结束时的尾部长度。'],
  ['reverb', '混响', '声音的混响程度，例如干声或少量混响。'],
] as const;

function ModelInputRow({ line, separator, columns }: {
  line: string;
  separator: string;
  columns: readonly (typeof fields)[number][];
}) {
  const values = line.split(separator);
  if (values.length !== columns.length) return line;

  return columns.map(([field, name], index) => {
    const value = values[index];
    const delimiter = index < values.length - 1 ? separator : '';
    // An empty cell has no text to hover, so its closing separator carries the label.
    return <Fragment key={field}>
      <span className="sl-model-input-value" title={`${name} (${field})${value === '' ? ' · 空值' : ''}`}>
        {value || delimiter}
      </span>
      {value && delimiter}
      {delimiter && <wbr />}
    </Fragment>;
  });
}

const headingFields = fields.slice(0, 2);
const variantFields = fields.slice(2);

export function ModelInputPreview({ snippet }: { snippet: string }) {
  const [heading, row] = snippet.split('\n');
  const hasVariant = heading.startsWith('@ ') && row !== undefined;

  return <pre className="sl-model-input" aria-label="当前变体的模型输入">
    {hasVariant ? <>
      {'@ '}<ModelInputRow line={heading.slice(2)} separator=" | " columns={headingFields} />
      {'\n'}<ModelInputRow line={row} separator="|" columns={variantFields} />
    </> : snippet}
  </pre>;
}

export function ModelInputFields({ legend }: { legend: string }) {
  const id = useId();
  const [mode, setMode] = useState<'closed' | 'preview' | 'pinned'>('closed');
  const open = mode !== 'closed';
  const preview = () => setMode(current => current === 'closed' ? 'preview' : current);
  const closePreview = () => setMode(current => current === 'preview' ? 'closed' : current);

  return <div className="sl-model-fields" onPointerLeave={closePreview}
    onBlur={event => {
      if (!event.currentTarget.contains(event.relatedTarget)) closePreview();
    }}
    onKeyDown={event => {
      if (event.key === 'Escape') setMode('closed');
    }}>
    <button type="button" aria-expanded={open} aria-controls={id}
      onPointerEnter={event => { if (event.pointerType === 'mouse') preview(); }}
      onFocus={event => { if (event.currentTarget.matches(':focus-visible')) preview(); }}
      onClick={() => setMode(current => current === 'pinned' ? 'closed' : 'pinned')}>
      字段说明
    </button>
    <div id={id} hidden={!open} className="sl-model-field-table">
      <p className="sl-model-field-legend">{legend}</p>
      <table aria-label="模型输入字段说明">
        <thead><tr><th scope="col">字段</th><th scope="col">名称</th><th scope="col">含义</th></tr></thead>
        <tbody>{fields.map(([field, name, description]) => <tr key={field}>
          <th scope="row"><code>{field}</code></th><td>{name}</td><td>{description}</td>
        </tr>)}</tbody>
      </table>
    </div>
  </div>;
}
