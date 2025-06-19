## Bug 备案记录

### 引用块渲染丢失问题

**ID:** NMP-BUG-001
**标题:** 在引入图片画廊功能后，引用块（Blockquote）在预览和复制内容中意外丢失
**报告日期:** 2025年6月19日
**状态:** 已定位根源
**严重等级:** 严重 (Blocker)

#### 问题描述 (Description)

在为实现图片并排显示功能，对 `src/markdown/parser.ts` 文件中的 `parse` 方法进行重构后，插件出现了一个严重的渲染问题：所有的 Markdown 引用块（包括标准的 `>` 引用和 `[!NOTE]` 形式的 Callout）在插件的预览窗格中都无法显示，并且在使用“复制”功能时，这部分内容也会从最终的 HTML 中丢失。

#### 复现步骤 (Reproduction Steps)

1.  在 `src/markdown/parser.ts` 的 `MarkedParser` 类中，实现一个新的 `async parse` 方法。
2.  在此方法中，将 `marked.js` 的解析过程从单步调用 `await this.marked.parse(content)` 拆分为三步：
    a. `let tokens = this.marked.lexer(content);`
    b. `tokens = this.processImageGalleries(tokens);` (对 token 流进行自定义处理)
    c. `let html = this.marked.parser(tokens);`
3.  在 Obsidian 中加载此版本的插件。
4.  创建一个包含标准引用块的 Markdown 文件，例如：
    ```markdown
    > 这是一段测试引用的文字。
    
    一些其他文字。
    ```
5.  打开插件的预览窗格。

#### 预期行为 (Expected Behavior)

预览窗格应正常渲染引用块的样式和内容。

#### 实际行为 (Actual Behavior)

预览窗格中仅显示“一些其他文字”，引用块部分完全丢失。

#### 根源分析 (Root Cause Analysis)

问题的根源在于对 `marked.js` 解析流程的误解。

`marked.js` 的完整解析流程包含三个主要阶段：**Lexer**（词法分析，将字符串转为Tokens）、**walkTokens**（遍历并预处理Tokens，执行异步钩子）和 **Parser**（将Tokens转换为HTML）。

* 当使用 `marked.parse(string)` 进行**一体化调用**时，这三个阶段会依次完整执行。项目中 `Blockquote` 扩展的逻辑依赖于 `walkTokens` 钩子来**异步预渲染**其内容，并将结果存入 `token.html` 属性。

* 当为了插入自定义的 `processImageGalleries` 逻辑而将流程**手动拆分**为 `lexer()` 和 `parser(tokens)` 时，直接调用 `parser(tokens)` 会**跳过 `walkTokens` 阶段**。

* 由于 `walkTokens` 阶段被跳过，`Blockquote` 扩展的异步渲染逻辑从未被触发。因此，当 `parser` 阶段执行到 `blockquote` token 时，其 `token.html` 属性为 `undefined`。
* `Blockquote` 扩展的 `renderer` 设计为直接返回 `token.html` 的值，因此它返回了 `undefined`，导致该元素没有生成任何 HTML 输出，从而在最终的视图中“丢失”。

#### 解决方案 (Resolution)

**核心思路**：既然必须拆分 `lexer` 和 `parser`，就需要手动将 `walkTokens` 的功能模拟并插入到流程中。

1.  **保持 `src/markdown/blockquote.ts` 的 `walkTokens` 实现不变**。该文件中的异步预渲染逻辑是正确的，问题在于它没有被调用。

2.  **修改 `src/markdown/parser.ts` 中的 `parse` 方法**，在 `lexer` 和 `parser` 调用之间，手动执行所有已注册扩展的 `walkTokens` 钩子。

    ```typescript
    // src/markdown/parser.ts
    
    async parse(content: string) {
        if (!this.marked) await this.buildMarked();
        await this.prepare();
        
        // 1. Lexer
        let tokens = this.marked.lexer(content);
        
        // 2. 自定义Token处理
        tokens = this.processImageGalleries(tokens);
    
        // 3. 手动执行 walkTokens 钩子 (关键修复)
        const walkers = [];
        for (const ext of this.extensions) {
            const markedExt = ext.markedExtension();
            if (markedExt.walkTokens) {
                walkers.push(markedExt.walkTokens.bind(ext));
            }
        }
        if (walkers.length > 0) {
            for (const token of tokens) {
                for (const walker of walkers) {
                    await walker(token);
                }
            }
        }
        
        // 4. Parser (现在可以安全调用)
        let html = this.marked.parser(tokens);  
        
        // 5. 后处理
        html = await this.postprocess(html);
        return html;
    }
    ```
