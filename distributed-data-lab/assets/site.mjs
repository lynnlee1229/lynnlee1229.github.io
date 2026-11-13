import { renderIceberg } from "./study.mjs";
import { inspectParquet, candidateGroups } from "./parquet.mjs";
const zh = document.documentElement.lang === "zh";
const tr = (en, cn) => (zh ? cn : en);
const $ = (id) => document.getElementById(id);
const base = "/distributed-data-lab/";
const methods = {
  parquet:
    "每种模式预热一次，正式测量三次并交替顺序。读取字节是在 Python 文件 read() 接口计数的引擎请求，可能包含重复元数据与缓存命中，不等于磁盘或网络字节。候选列块字节仅由 Footer 估算，不含元数据、页索引与请求合并。计时含读取、过滤与排序，不含验证、文件生成与进程启动；不清空 OS 缓存。",
  hdfs: "用 SIGTERM 停止自己的一个 DataNode。四个独立数据目录、RF=3，三个幸存节点可以为缺失副本提供新目标。轮询可能错过短暂副本不足状态。死亡检测观测含故障后读取，恢复观测是时间上界，不是精确调度耗时。实验心跳 1 秒、recheck 1000 ms、副本检查 1 秒；没有 NameNode HA、机架、宿主故障或生产吞吐测试。",
  database:
    "三个真实进程，核验复制范围与不同 Leaseholder。先在跨范围事务中提交两次更新，再对不同行制造实际 Write Skew，观察未经注入的 40001。计时只作诊断；没有网络分区、节点崩溃、跨机器扩展、生产容量或磁盘持久化验证。使用固定非生产教学二进制，不使用付费特性或云账户。",
};
function node(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function table(headers, rows) {
  const w = node("div", undefined, { class: "table-wrap" }),
    t = node("table"),
    thead = node("thead"),
    tr = node("tr");
  for (const h of headers) tr.append(node("th", h, { scope: "col" }));
  thead.append(tr);
  t.append(thead);
  const body = node("tbody");
  for (const row of rows) {
    const r = node("tr");
    for (const cell of row) r.append(node("td", String(cell ?? "—")));
    body.append(r);
  }
  t.append(body);
  w.append(t);
  return w;
}
function detail(title, data) {
  const d = node("details");
  d.append(
    node("summary", title),
    node(
      "pre",
      typeof data === "string" ? data : JSON.stringify(data, null, 2),
    ),
  );
  return d;
}
function download(data, name) {
  const u = URL.createObjectURL(
    new Blob([JSON.stringify(data, null, 2)], { type: "application/json" }),
  );
  const a = node("a", undefined, { href: u, download: name });
  a.click();
  setTimeout(() => URL.revokeObjectURL(u), 2000);
}
if ($("file")) {
  let current = null;
  const status = $("status");
  function message(s, error = false) {
    status.textContent = s;
    status.className = "status" + (error ? " error" : "");
  }
  function render() {
    if (!current) return;
    const r = current;
    const c = $("column").value;
    const lo = Number($("lower").value),
      hi = Number($("upper").value);
    let groups;
    try {
      groups = candidateGroups(r, c, lo, hi);
    } catch (e) {
      message(e.message, true);
      return;
    }
    const candidates = groups.filter((g) => g.candidate).length;
    message(
      tr(
        `${r.rows} rows · ${r.row_groups.length} row groups · ${candidates} candidates / ${groups.length - candidates} rejected by metadata`,
        `${r.rows} 行 · ${r.row_groups.length} 个组 · 元数据保留 ${candidates} 组 / 排除 ${groups.length - candidates} 组`,
      ),
    );
    $("groups").replaceChildren(
      ...groups.map((g) => {
        const n = node("div", "RG " + g.index, {
          class: "group" + (g.candidate ? "" : " pruned"),
          title: g.reason,
        });
        n.append(
          node(
            "span",
            g.candidate ? tr("candidate", "候选") : tr("rejected", "排除"),
          ),
        );
        return n;
      }),
    );
    const rows = r.row_groups.flatMap((g) =>
      g.columns.map((x) => [
        g.index,
        x.path,
        x.physical_type,
        x.codec,
        x.encodings?.join(", "),
        x.compressed_bytes,
        x.min,
        x.max,
        x.null_count,
      ]),
    );
    $("metadata").replaceChildren(
      table(
        [
          tr("Group", "组"),
          "Column",
          "Physical",
          "Codec",
          "Encoding",
          tr("Chunk bytes", "块字节"),
          "Min",
          "Max",
          "Nulls",
        ],
        rows,
      ),
    );
    $("file-info").textContent = tr(
      `File ${r.file_bytes.toLocaleString()} bytes; footer ${r.footer_bytes.toLocaleString()} bytes. Read only header, footer length and footer.`,
      `文件 ${r.file_bytes.toLocaleString()} 字节，Footer ${r.footer_bytes.toLocaleString()} 字节。只读取 Header、Footer 长度和 Footer。`,
    );
    $("raw").replaceChildren(
      detail(tr("Full parsed footer report", "完整 Footer 解析结果"), r),
    );
    $("export").disabled = false;
  }
  async function load(file, label) {
    try {
      message(tr("Reading local footer…", "正在读取本地 Footer…"));
      current = await inspectParquet(file);
      $("filename").textContent = label;
      const options = current.columns.map((c) =>
        node("option", c.path, { value: c.path }),
      );
      $("column").replaceChildren(...options);
      $("column").value = current.columns.find((c) => c.path === "id")
        ? "id"
        : current.columns[0]?.path;
      render();
    } catch (e) {
      current = null;
      $("filename").textContent = label;
      $("file-info").textContent = "";
      $("groups").replaceChildren();
      $("metadata").replaceChildren();
      $("raw").replaceChildren();
      $("export").disabled = true;
      message(e.message, true);
    }
  }
  $("file").addEventListener("change", (e) => {
    const f = e.target.files[0];
    if (f) load(f, f.name);
  });
  for (const name of ["sorted", "shuffled"])
    $("sample-" + name).addEventListener("click", async () => {
      try {
        const res = await fetch(base + "samples/" + name + ".parquet");
        if (!res.ok) throw Error("Sample unavailable");
        await load(
          await res.blob(),
          tr("Synthetic sample: ", "合成样本：") + name,
        );
      } catch (e) {
        message(e.message, true);
      }
    });
  $("apply").addEventListener("click", render);
  $("export").addEventListener("click", () => {
    if (current) download(current, "parquet-footer-report.json");
  });
}
if ($("evidence-output")) {
  let reports = {};
  const output = $("evidence-output");
  const median = (a) =>
    a.slice().sort((a, b) => a - b)[Math.floor(a.length / 2)];
  async function show(name) {
    try {
      for (const b of document.querySelectorAll("[data-report]"))
        b.setAttribute("aria-pressed", String(b.dataset.report === name));
      const r =
        reports[name] ??
        (reports[name] = await (
          await fetch(base + "results/" + name + ".json")
        ).json());
      output.replaceChildren();
      if (name === "parquet") {
        output.append(
          node(
            "h2",
            tr(
              "Layout, requested bytes and equal results",
              "布局、读取请求与等结果验证",
            ),
          ),
          node("p", zh ? methods[name] : r.method),
          table(
            [
              tr("Variant", "文件"),
              tr("Groups retained", "保留组"),
              tr("File bytes", "文件字节"),
            ],
            r.variants.map((v) => [
              v.name,
              v.metadata.candidate_groups + "/" + v.metadata.row_groups.length,
              v.metadata.file_bytes,
            ]),
          ),
        );
        const max = Math.max(
          ...r.variants.map((v) =>
            median(
              v.runs
                .filter((x) => x.mode === "projected_filter")
                .map((x) => x.engine_requested_bytes),
            ),
          ),
        );
        output.append(
          node(
            "h3",
            tr(
              "Projected + filtered: median requested bytes",
              "只读所需列并过滤：请求字节中位数",
            ),
          ),
        );
        for (const v of r.variants) {
          const value = median(
            v.runs
              .filter((x) => x.mode === "projected_filter")
              .map((x) => x.engine_requested_bytes),
          );
          const row = node("div", undefined, { class: "barrow" });
          const bar = node("div", undefined, { class: "bar" }),
            i = node("i");
          i.style.width = (100 * value) / max + "%";
          bar.append(i);
          row.append(
            node("span", v.name),
            bar,
            node("span", value.toLocaleString()),
          );
          output.append(row);
        }
        output.append(
          table(
            [
              tr("Variant", "文件"),
              "Mode",
              tr("Median ms", "耗时中位数 ms"),
              tr("Requested bytes", "请求字节"),
              "Rows",
            ],
            r.variants.flatMap((v) =>
              ["wide_filter", "projected_filter", "projected_no_pushdown"].map(
                (mode) => {
                  const runs = v.runs.filter((x) => x.mode === mode);
                  return [
                    v.name,
                    mode,
                    median(runs.map((x) => x.elapsed_ms)).toFixed(3),
                    median(runs.map((x) => x.engine_requested_bytes)),
                    runs[0].rows,
                  ];
                },
              ),
            ),
          ),
          detail(tr("Every repetition and read span", "每次重复与读取区间"), r),
        );
      } else if (name === "hdfs") {
        output.append(
          node(
            "h2",
            tr(
              "One stopped DataNode, thirteen repaired blocks",
              "停止一个 DataNode，十三块恢复副本",
            ),
          ),
          node("p", zh ? methods[name] : r.method),
          table(
            ["State", "Live", "Dead", "Blocks"],
            [
              [
                "before",
                r.before_state.NumLiveDataNodes,
                r.before_state.NumDeadDataNodes,
                r.before.blocks.length,
              ],
              [
                "after",
                r.after_state.NumLiveDataNodes,
                r.after_state.NumDeadDataNodes,
                r.after.blocks.length,
              ],
            ],
          ),
          node(
            "p",
            tr(
              `Stopped transfer port: ${r.victim_transfer_port}. All three SHA256 values match.`,
              `停止的传输端口：${r.victim_transfer_port}；三次 SHA256 相同。`,
            ),
          ),
          table(
            [
              "Block",
              "Before replicas",
              "Before ports",
              "After replicas",
              "After ports",
            ],
            r.before.blocks.map((b, i) => [
              b.block,
              b.live_replicas,
              b.locations.join(", "),
              r.after.blocks[i]?.live_replicas,
              r.after.blocks[i]?.locations.join(", "),
            ]),
          ),
          detail("Before fsck", r.before.text),
          detail("After fsck", r.after.text),
          detail(
            tr("Checksums, states and timing bounds", "摘要、状态与计时边界"),
            r,
          ),
        );
      } else if (name === "iceberg") {
        renderIceberg(output, r);
      } else {
        output.append(
          node(
            "h2",
            tr(
              "Real range placement and serialization conflict",
              "真实范围放置与可串行化冲突",
            ),
          ),
          node("p", zh ? methods[name] : r.method),
          node("p", r.version),
          table(
            ["Range", "Start", "End", "Leaseholder", "Replicas"],
            r.ranges.map((x) => [
              x.range_id,
              x.start_key,
              x.end_key,
              x.lease_holder,
              x.replicas.join(", "),
            ]),
          ),
          table(
            ["Client", "Outcome", "SQLSTATE", "ms"],
            r.conflict.outcomes.map((x) => [
              x.client,
              x.status,
              x.sqlstate,
              x.elapsed_ms.toFixed(3),
            ]),
          ),
          node(
            "p",
            tr(
              `Final total: ${r.conflict.final.reduce((s, x) => s + x.balance, 0)}. Fresh retry: ${r.conflict.retry.decision}.`,
              `最终总额：${r.conflict.final.reduce((s, x) => s + x.balance, 0)}。读取新总额后重试：${r.conflict.retry.decision}。`,
            ),
          ),
          detail(
            tr("Executed query plan", "已执行查询计划"),
            r.plan.join("\n"),
          ),
          detail(
            tr("Cross-range transfer KV trace", "跨范围转账 KV Trace"),
            r.transfer.kv_trace,
          ),
          detail(
            tr("Balances, metrics and full evidence", "余额、指标与完整证据"),
            r,
          ),
        );
      }
      const a = node(
        "a",
        tr("Download this recorded JSON", "下载这份已保存 JSON"),
        { href: base + "results/" + name + ".json", download: name + ".json" },
      );
      output.append(a);
    } catch (e) {
      output.replaceChildren(
        node(
          "p",
          tr("Could not load evidence: ", "无法加载证据：") + e.message,
        ),
      );
    }
  }
  for (const b of document.querySelectorAll("[data-report]"))
    b.addEventListener("click", () => show(b.dataset.report));
  show(new URLSearchParams(location.search).get("profile") || "parquet");
}
