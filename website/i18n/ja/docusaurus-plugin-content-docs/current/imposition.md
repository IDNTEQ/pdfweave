# 印刷面付け

`@pdfweave/imposition`は、論理PDFページをより大きな物理印刷シートに配置します。テンプレートジェネレーターとは独立しているため、`source`にはPDFweaveまたは別のシステムで作成したPDFを指定できます。

## インストール

初回のnpm公開までは、リポジトリのワークスペースを使用してください。依存するPDFweaveパッケージも先にビルドするため、ルートのビルドを実行します。

```bash
git clone https://github.com/IDNTEQ/pdfweave.git
cd pdfweave
npm install
npm run build
```

## A4に3面付けする例

入力寸法の既定単位はミリメートルです。返却されるプランの座標は常にPDFポイントです。

```ts
import { impose } from '@pdfweave/imposition';

const { pdf, plan, warnings } = await impose({
  source: boletoPdf,
  sheet: {
    size: 'A4',
    margins: 6,
    gutter: { horizontal: 0, vertical: 3 },
  },
  layout: {
    type: 'n-up',
    rows: 3,
    columns: 1,
    scale: 'contain',
  },
});
```

`plan.sheets`にはすべての物理配置と空きスロットが含まれます。`warnings`は、元ページボックスのフォールバックやForm XObjectへ引き継げない注釈を報告します。

原稿ボックスの非ゼロ原点、ページの`/Rotate`、`/UserUnit`は、プラン内で物理ポイントへ正規化され、各配置の変換へ反映されます。

## A3とカスタムシート

```ts
const a3 = await impose({
  source: statementsPdf,
  sheet: { size: 'A3', orientation: 'landscape', margins: 8, gutter: 4 },
  layout: { type: 'n-up', rows: 2, columns: 2, autoRotate: true },
});

const custom = await impose({
  source: labelsPdf,
  unit: 'mm',
  sheet: { size: { width: 330, height: 488 }, margins: 10, gutter: 3 },
  layout: { type: 'n-up', rows: 5, columns: 3 },
});
```

名前付きサイズはA2、A3、A4、A5、A6、Letter、Legalです。カスタム寸法、余白、溝をポイントで指定する場合は`unit: 'pt'`を使用します。
カスタムシート寸法は、正規化後に0.01〜14,400 PDFポイントの範囲である必要があります。

## ページ、部数、丁合

`pages`は0始まりの元ページ番号で、同じ番号を複数回指定できます。`sequence`で部数と`collated`または`uncollated`の順序を指定できます。サービス境界では`limits.maxPlacements`と`limits.maxSheets`を使用して処理量を制限してください。

## テスト成果物

リポジトリで`npm run qualification`を実行すると、機能一覧、正確なテスト定義、クリック可能なPDF、レンダリング済みPNG、配置マニフェストをまとめた自己完結型の`test-artifacts/qualification-report.html`が生成されます。Pull Request CIでは`pdfweave-qualification-report`成果物として公開されます。個別ファイルは`packages/imposition/test-artifacts/n-up/`にも生成されます。

## 現在の範囲

Phase 1は決定的な片面n-up面付けをサポートします。両面の表裏対応、中綴じ折丁、クリープ、断裁・見当マーク、カラーバー、印刷プリフライトはまだ実装されていません。
