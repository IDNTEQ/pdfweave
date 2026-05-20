# テンプレート貢献ガイド ❤️

あなたのテンプレートをPDFweaveのサンプルテンプレートに追加しましょう！  
**[テンプレート一覧ページ](/templates)はidnteq.github.io/pdfweaveの最も重要なページの一つで、新しいユーザーが要件に合ったテンプレートを見つけて時間を節約できるように作られています。**

テンプレートを追加することで、PDFweaveコミュニティに貢献できます。  
テンプレートの追加にはGitHubのプルリクエストを使用します - ビルドやコード変更は必要ありません。  

OSSへの貢献が初めてでも、このガイドに従うことで簡単に貢献できます。

## テンプレート追加の手順

### 1. テンプレートを作成する
[テンプレートデザイナー](/template-design)でテンプレートをデザインし、`DL Template`ボタンを使って`template.json`をダウンロードします

### 2. リポジトリを準備する
1. **[フォークを作成]**  
   [PDFweaveリポジトリ](https://github.com/IDNTEQ/pdfweave)の右上にある`Fork`ボタンをクリックして、あなたのGitHubアカウントにコピーします
   
2. **[ローカルにクローン]**  
   ターミナルで実行します（`YOUR-GITHUB-USERNAME`をあなたのGitHubユーザー名に置き換えてください）：
   ```bash
   git clone git@github.com:YOUR-GITHUB-USERNAME/pdfweave.git
   cd pdfweave
   ```

3. **[ブランチを作成]**  
   新しいブランチを作成します（例：テンプレート名`my-new-template`を使用）：
   ```bash
   git checkout -b add-my-new-template
   ```

### 3. テンプレートファイルを追加する
1. **[ディレクトリを作成]**  
   kebab-caseで新しいディレクトリを作成します（例：`my-new-template`）：
   ```bash
   mkdir -p playground/public/template-assets/my-new-template
   ```
   - ディレクトリ名は[テンプレート一覧ページ](/templates)で`My New Template`として表示されます

2. **[ファイルを配置]**  
   ダウンロードした`template.json`を新しいディレクトリに配置します  
   （オプション）クレジットのために`author`フィールドを追加します：
   ```json
   {
     "author": "YOUR-GITHUB-USERNAME",
     "basePdf": ...
   }
   ```

参考：https://github.com/IDNTEQ/pdfweave/tree/main/playground/public/template-assets/invoice

### 4. 変更をコミットする
1. **[変更を記録]**  
   ターミナルで実行します：
   ```bash
   git add .
   git commit -m "feat: Add My New Template"
   ```

2. **[GitHubにプッシュ]**  
   あなたのリポジトリにプッシュします：
   ```bash
   git push origin add-my-new-template
   ```

### 5. プルリクエストを作成する
1. **GitHubでPRを作成**  
   あなたのリポジトリページに移動 → `Pull requests` → `New pull request`

2. **ブランチを選択**  
   - `base repository`：IDNTEQ/pdfweave（mainブランチ）
   - `head repository`：YOUR-GITHUB-USERNAME/pdfweave（add-my-new-templateブランチ）

3. **情報を入力**  
   - タイトル：`Add [My New Template] template`
   - テンプレートの特徴とユースケースの簡単な説明を含める

4. **PRを送信**  
   `Create pull request`をクリックして完了！

### 6. マージを待つ
メンテナーのレビュー後、あなたのテンプレートがマージされ、正式に掲載されます 🎉  
（修正が必要な場合は、GitHubでコメントを受け取ります）

**ありがとうございます！あなたの貢献はPDFweaveのコミュニティに大きな影響を与えます 🚀**

## サポートが必要ですか？

