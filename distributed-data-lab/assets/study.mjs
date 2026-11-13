/* Original study views for measured Iceberg reports and verified public readings. */
const zh = document.documentElement.lang === "zh";
const tr = (en, cn) => (zh ? cn : en);
function el(tag, text, attrs = {}) {
  const e = document.createElement(tag);
  if (text !== undefined) e.textContent = text;
  for (const [k, v] of Object.entries(attrs)) e.setAttribute(k, v);
  return e;
}
function gridTable(headers, rows) {
  const w = el("div", undefined, { class: "table-wrap" }),
    t = el("table"),
    head = el("thead"),
    hr = el("tr");
  for (const h of headers) hr.append(el("th", h, { scope: "col" }));
  head.append(hr);
  t.append(head);
  const b = el("tbody");
  for (const row of rows) {
    const r = el("tr");
    for (const c of row)
      r.append(el("td", c === null ? "null" : String(c ?? "—")));
    b.append(r);
  }
  t.append(b);
  w.append(t);
  return w;
}
function details(title, value) {
  const d = el("details");
  d.append(
    el("summary", title),
    el(
      "pre",
      typeof value === "string" ? value : JSON.stringify(value, null, 2),
    ),
  );
  return d;
}
export function renderIceberg(output, r) {
  output.append(
    el("h2", tr("A snapshot is a committed rowset", "快照对应已提交的行集合")),
    el(
      "p",
      tr(
        "Saved real PyIceberg results. Switching snapshots below inspects recorded rows; it does not execute an Iceberg engine in your browser.",
        "下方来自真实 PyIceberg 保存结果。切换快照是在检查已记录行，不是在浏览器中执行 Iceberg 引擎。",
      ),
    ),
    el(
      "p",
      `PyIceberg ${r.versions.pyiceberg} · PyArrow ${r.versions.pyarrow} · SQLite ${r.versions.sqlite} · format v${r.table_format_version}`,
    ),
    el(
      "div",
      tr(
        "Local SQLite catalog + filesystem. No cloud, concurrent-catalog, crash, delete-file interoperability or AI-quality claim.",
        "本地 SQLite catalog 与文件系统。没有云、目录并发、崩溃、删除文件跨引擎兼容或 AI 质量验证。",
      ),
      { class: "note" },
    ),
  );
  output.append(
    gridTable(
      [
        tr("Snapshot", "快照"),
        "ID",
        tr("Parent", "父 ID"),
        tr("Schema", "Schema"),
        tr("Rows", "行数"),
      ],
      r.snapshots.map((x) => [
        x.label,
        x.snapshot_id,
        x.parent_snapshot_id,
        x.schema_id,
        x.rows,
      ]),
    ),
  );
  const choices = el("div", undefined, { class: "tabs" }),
    view = el("div", undefined, { "aria-live": "polite" });
  const cases = [
    {
      key: "base",
      label: tr("Pinned base · 3 rows", "固定首快照 · 3 行"),
      snapshot: r.snapshots[0],
      rows: r.time_travel.base_rows_after_later_commits,
    },
    {
      key: "second",
      label: tr("Second append · 5 rows", "第二快照 · 5 行"),
      snapshot: r.snapshots[1],
      rows: r.time_travel.second_rows_after_later_commits,
    },
    {
      key: "current",
      label: tr("Latest · 6 rows", "当前快照 · 6 行"),
      snapshot: r.snapshots[2],
      rows: r.time_travel.current_rows,
    },
  ];
  function select(selected) {
    for (const button of choices.querySelectorAll("button"))
      button.setAttribute(
        "aria-pressed",
        String(button.dataset.snapshot === selected.key),
      );
    const columns = Object.keys(selected.rows[0]);
    view.replaceChildren(
      el(
        "p",
        tr(
          `Snapshot ${selected.snapshot.snapshot_id}; schema ${selected.snapshot.schema_id}; ${selected.rows.length} actual recorded rows.`,
          `快照 ${selected.snapshot.snapshot_id}；Schema ${selected.snapshot.schema_id}；${selected.rows.length} 条实际记录。`,
        ),
      ),
      gridTable(
        columns,
        selected.rows.map((row) => columns.map((k) => row[k])),
      ),
    );
  }
  for (const c of cases) {
    const b = el("button", c.label, {
      "data-snapshot": c.key,
      "aria-pressed": String(c.key === "current"),
    });
    b.addEventListener("click", () => select(c));
    choices.append(b);
  }
  output.append(choices, view);
  select(cases[2]);
  output.append(
    el("h3", tr("The valid-file counterexample", "合法文件的反例")),
    gridTable(
      [tr("Reader", "读取方式"), tr("Observed IDs", "实际 ID")],
      [
        [
          tr("Committed Iceberg table", "已提交 Iceberg 表"),
          r.counterexample.committed_ids.join(", "),
        ],
        [
          tr("Naive physical-file union", "朴素物理文件合并"),
          r.counterexample.naive_directory_ids.join(", "),
        ],
      ],
    ),
    el(
      "p",
      tr(
        "id=999 exists in a valid Parquet file, but no committed manifest references it. No files or snapshots were deleted.",
        "id=999 位于合法 Parquet 文件中，但没有已提交 Manifest 引用它。没有删除文件或快照。",
      ),
    ),
  );
  output.append(
    el("h3", tr("A rename keeps field identity", "改名保留字段身份")),
    gridTable(
      [tr("Before", "改名前"), tr("After", "改名后"), "Field ID"],
      [
        [
          "category",
          "topic",
          r.schema_evolution.after_fields.find((x) => x.name === "topic").id,
        ],
      ],
    ),
    el(
      "p",
      tr(
        `The schema metadata commit kept data snapshot ${r.schema_evolution.data_snapshot_id_before}. Current projection and explicit snapshot projection use different schema selection in PyIceberg 0.10.0.`,
        `Schema 元数据提交保留数据快照 ${r.schema_evolution.data_snapshot_id_before}。PyIceberg 0.10.0 的当前投影和显式快照投影采用不同 Schema 选择。`,
      ),
    ),
    details(
      tr(
        "Actual fields, rowsets and schema-only snapshot IDs",
        "实际字段、行集合与 Schema-only 快照 ID",
      ),
      r.schema_evolution,
    ),
    details(
      tr(
        "Physical Parquet field IDs and immutable file hashes",
        "物理 Parquet 字段 ID 与不可变文件哈希",
      ),
      r.metadata_validation,
    ),
  );
  output.append(
    el("h3", tr("Old and new partition specs coexist", "新旧分区规范共存")),
    gridTable(
      [
        "Spec ID",
        tr("Rows in file", "文件行数"),
        tr("Relative file", "相对文件路径"),
      ],
      r.partition_evolution.files.map((x) => [
        x.spec_id,
        x.record_count,
        x.path,
      ]),
    ),
    details(
      tr(
        "Filtered file plan and exact storage rows",
        "过滤文件计划与精确 storage 行",
      ),
      r.partition_evolution,
    ),
    details(
      tr("Pinned / latest fingerprints", "固定快照 / 当前快照哈希"),
      r.time_travel,
    ),
    details(tr("Complete real report", "完整真实报告"), r),
  );
}
if (document.getElementById("resource-search")) {
  const input = document.getElementById("resource-search"),
    course = document.getElementById("resource-course"),
    unit = document.getElementById("resource-unit"),
    list = document.getElementById("resource-results"),
    status = document.getElementById("resource-status");
  try {
    const response = await fetch("/distributed-data-lab/resources.json");
    if (!response.ok) throw Error("Resource inventory unavailable");
    const inventory = await response.json();
    const courses = new Map(inventory.courses.map((c) => [c.id, c]));
    function render() {
      const query = input.value.toLocaleLowerCase().trim();
      const records = inventory.resources.filter((r) => {
        const c = courses.get(r.course_id);
        const text = JSON.stringify([r, c]).toLocaleLowerCase();
        return (
          (!query || text.includes(query)) &&
          (!course.value ||
            (course.value === "official"
              ? !r.course_id
              : r.course_id === course.value)) &&
          (!unit.value || r.units.includes(unit.value))
        );
      });
      status.textContent = tr(
        `${records.length} / ${inventory.resources.length} verified records · checked ${inventory.verified_on}`,
        `${records.length} / ${inventory.resources.length} 条已核验资源 · ${inventory.verified_on}`,
      );
      list.replaceChildren();
      for (const r of records) {
        const c = courses.get(r.course_id);
        const card = el("article", undefined, { class: "card" });
        card.append(
          el(
            "span",
            c ? `${c.school} · ${c.course_number} · ${c.term}` : r.provider,
            { class: "badge" },
          ),
          el("h3", r.title),
          el("p", r.locator),
          el("p", r.connection?.[zh ? "zh" : "en"] ?? r.era),
          el(
            "p",
            tr(
              `Units ${r.units.join(", ")} · published · verified ${r.verified_on}`,
              `单元 ${r.units.join(", ")} · 已发布 · 核验 ${r.verified_on}`,
            ),
            { class: "source" },
          ),
          el("a", tr("Read the primary source →", "阅读原始来源 →"), {
            href: r.url,
          }),
        );
        list.append(card);
      }
    }
    for (const control of [input, course, unit])
      control.addEventListener(control === input ? "input" : "change", render);
    render();
  } catch (e) {
    status.textContent =
      tr("Could not load resource inventory: ", "无法加载资源清单：") +
      e.message;
  }
}
