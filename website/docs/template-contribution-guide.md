# Template Contribution Guide ❤️

Add your template to PDFweave's Example Templates!  
**The [Template List page](/templates) is one of the most important pages on idnteq.github.io/pdfweave, created to help new users find templates that match their requirements and save time.**

By adding your template, you can contribute to the PDFweave community.  
We use GitHub pull requests for template additions - no builds or code changes required.  

Even if you're new to OSS contributions, you can easily contribute by following this guide.

## Template Addition Steps

### 1. Create Your Template
Design your template in the [Template Designer](/template-design), then download `template.json` using the `DL Template` button

### 2. Prepare Repository
1. **[Create Fork]**  
   Click the `Fork` button at the top-right of [PDFweave repository](https://github.com/IDNTEQ/pdfweave) to copy to your GitHub account
   
2. **[Clone Locally]**  
   Run in terminal (replace `YOUR-GITHUB-USERNAME` with your GitHub username):
   ```bash
   git clone git@github.com:YOUR-GITHUB-USERNAME/pdfweave.git
   cd pdfweave
   ```

3. **[Create Branch]**  
   Create new branch (example using template name `my-new-template`):
   ```bash
   git checkout -b add-my-new-template
   ```

### 3. Add Template Files
1. **[Create Directory]**  
   Create new directory in kebab-case (e.g. `my-new-template`):
   ```bash
   mkdir -p playground/public/template-assets/my-new-template
   ```
   - Directory name will appear as `My New Template` on [Template List page](/templates)

2. **[Place Files]**  
   Place downloaded `template.json` in the new directory  
   (Optional) Add `author` field for credit:
   ```json
   {
     "author": "YOUR-GITHUB-USERNAME",
     "basePdf": ...
   }
   ```

Reference: https://github.com/IDNTEQ/pdfweave/tree/main/playground/public/template-assets/invoice

### 4. Commit Changes
1. **[Record Changes]**  
   Run in terminal:
   ```bash
   git add .
   git commit -m "feat: Add My New Template"
   ```

2. **[Push to GitHub]**  
   Push to your repository:
   ```bash
   git push origin add-my-new-template
   ```

### 5. Create Pull Request
1. **Create PR on GitHub**  
   Go to your repository page → `Pull requests` → `New pull request`

2. **Select Branches**  
   - `base repository`: IDNTEQ/pdfweave (main branch)
   - `head repository`: YOUR-GITHUB-USERNAME/pdfweave (add-my-new-template branch)

3. **Enter Information**  
   - Title: `Add [My New Template] template`
   - Include brief description of template features and use cases

4. **Submit PR**  
   Click `Create pull request` to complete!

### 6. Await Merge
After maintainer review, your template will be merged and listed officially 🎉  
(If modifications needed, you'll receive comments on GitHub)

**Thank you! Your contribution makes a big impact on PDFweave's community 🚀**

## Need Help?

