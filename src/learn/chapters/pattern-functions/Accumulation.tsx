import { CodeBlock } from '../../components';

export default function Accumulation() {
  return (
    <>
      <h2>superimpose</h2>
      <p>把给出的函数的执行结果叠加（superimpose）在原本的 pattern 之上：</p>
      <CodeBlock code={`"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8"
  .superimpose(x=>x.add(2))
  .scale('C minor').note()`} />

      <h2>layer</h2>
      <p>
        叠放给出的多个函数的执行结果。与 <code>superimpose</code> 类似，但不包含原本的 pattern：
      </p>
      <CodeBlock code={`"<0 2 4 6 ~ 4 ~ 2 0!3 ~!5>*8"
  .layer(x=>x.add("0,2"))
  .scale('C minor').note()`} />

      <h2>off</h2>
      <p>把给出的函数的执行结果叠加到原本的 pattern 上，并按给定的时长做时间偏移：</p>
      <CodeBlock code={`"c3 eb3 g3".off(1/8, x=>x.add(7)).note()`} />

      <h2>echo</h2>
      <p>多次叠加并偏移原本的 pattern，同时逐渐降低音量：</p>
      <CodeBlock code={`s("bd sd").echo(3, 1/6, .8)`} />

      <h2>echoWith</h2>
      <p>
        与 <code>echo</code> 类似，但可以指定每一次重复要应用的自定义函数，而不是固定地降低音量。别名为 <code>stutWith</code>。
      </p>
      <CodeBlock code={`"<0 [2 4]>"
.echoWith(4, 1/8, (p,n) => p.add(n*2))
.scale("C:minor").note()`} />

      <h2>stut</h2>
      <p>
        已废弃。与 <code>echo</code> 类似，但最后两个参数的顺序是反过来的。
      </p>
      <CodeBlock code={`s("bd sd").stut(3, .8, 1/6)`} />
    </>
  );
}
