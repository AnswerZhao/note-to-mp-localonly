/*
 * Copyright (c) 2024-2025 Sun Booshi
 *
 * Permission is hereby granted, free of charge, to any person obtaining a copy
 * of this software and associated documentation files (the "Software"), to deal
 * in the Software without restriction, including without limitation the rights
 * to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
 * copies of the Software, and to permit persons to whom the Software is
 * furnished to do so, subject to the following conditions:
 *
 * The above copyright notice and this permission notice shall be included in
 * all copies or substantial portions of the Software.
 *
 * THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
 * IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
 * FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
 * AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
 * LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
 * OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN
 * THE SOFTWARE.
 */

import { Marked, Token, Tokens, TokensList } from "marked";
import { NMPSettings } from "src/settings";
import { App, Vault } from "obsidian";
import AssetsManager from "../assets";
import { Extension, MDRendererCallback } from "./extension";
import { Blockquote} from "./blockquote";
import { CodeHighlight } from "./code-highlight";
import { CodeRenderer } from "./code";
import { EmbedBlockMark } from "./embed-block-mark";
import { SVGIcon } from "./icons";
import { LinkRenderer } from "./link";
import { LocalFile, LocalImageManager } from "./local-file";
import { MathRenderer } from "./math";
import { TextHighlight } from "./text-highlight";
import { cleanUrl } from "../utils";
import { ImageGallery, ImageGalleryToken } from "./image-gallery";


const markedOptiones = {
    gfm: true,
    breaks: true,
};

const customRenderer = {
	heading(text: string, level: number, raw: string): string {
		// ignore IDs
		return `<h${level}>${text}</h${level}>`;
	},
	hr(): string {
		return '<hr>';
	},
	list(body: string, ordered: boolean, start: number | ''): string {
		const type = ordered ? 'ol' : 'ul';
		const startatt = (ordered && start !== 1) ? (' start="' + start + '"') : '';
		return '<' + type + startatt + '>' + body + '</' + type + '>';
	},
	listitem(text: string, task: boolean, checked: boolean): string {
		return `<li>${text}</li>`;
	},
	image(href: string, title: string | null, text: string): string {
		const cleanHref = cleanUrl(href);
		if (cleanHref === null) {
			return text;
		}
		href = cleanHref;

		if (!href.startsWith('http')) {
			const res = AssetsManager.getInstance().getResourcePath(decodeURI(href));
			if (res) {
				href = res.resUrl;
				const info = {
					resUrl: res.resUrl,
					filePath: res.filePath,
					url: null
				};
				LocalImageManager.getInstance().setImage(res.resUrl, info);	
			}
		}
        
        // 为图片添加一个标记类，例如 'note-mp-styled-image'
        let out = '';
		if (NMPSettings.getInstance().useFigcaption) {
			// 只生成结构，不添加复杂的 inline style
            out = `<figure><img class="note-mp-styled-image" src="${href}" alt="${text}"`;
			if (title) {
				out += ` title="${title}"`;
			}
			out += `><figcaption>${text}</figcaption></figure>`;
		} else {
            // 只生成结构，不添加复杂的 inline style
			out = `<img class="note-mp-styled-image" src="${href}" alt="${text}"`;
			if (title) {
				out += ` title="${title}"`;
			}
			out += '>';
		}
		return out;
	}
};

export class MarkedParser {
	extensions: Extension[] = [];
	marked: Marked;
	app: App;
	vault: Vault;

	constructor(app: App, callback: MDRendererCallback) {
		this.app = app;
		this.vault = app.vault;

		const settings = NMPSettings.getInstance();
		const assetsManager = AssetsManager.getInstance();

		this.extensions.push(new LocalFile(app, settings, assetsManager, callback));
		this.extensions.push(new ImageGallery(app, settings, assetsManager, callback));
		this.extensions.push(new Blockquote(app, settings, assetsManager, callback));
		this.extensions.push(new CodeHighlight(app, settings, assetsManager, callback));
		this.extensions.push(new EmbedBlockMark(app, settings, assetsManager, callback));
		this.extensions.push(new SVGIcon(app, settings, assetsManager, callback));
		this.extensions.push(new LinkRenderer(app, settings, assetsManager, callback));
		this.extensions.push(new TextHighlight(app, settings, assetsManager, callback));
		this.extensions.push(new CodeRenderer(app, settings, assetsManager, callback));
		if (settings.isAuthKeyVaild()) {
			this.extensions.push(new MathRenderer(app, settings, assetsManager, callback));
		}
	}

	async buildMarked() {
	    this.marked = new Marked();
		this.marked.use(markedOptiones);
		for (const ext of this.extensions) {
			this.marked.use(ext.markedExtension());
			ext.marked = this.marked;
			ext.extensions = this.extensions; 
			await ext.prepare();
		}
		// @ts-ignore
		this.marked.use({renderer: customRenderer});
	}
    
    private processImageGalleries(tokens: TokensList): TokensList {
        const isImageToken = (t: Token): t is Tokens.Image | Tokens.Generic => {
            return t.type === 'image' || t.type === 'LocalImage';
        };
    
        const isWhitespaceToken = (t: Token): boolean => {
            return t.type === 'br' || (t.type === 'text' && /^\s*$/.test(t.raw));
        };
    
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
    
            if (token.type !== 'paragraph' || !token.tokens) {
                continue;
            }
    
            const containsOnlyImagesAndWhitespace = token.tokens.every(
                subToken => isImageToken(subToken) || isWhitespaceToken(subToken)
            );
    
            if (!containsOnlyImagesAndWhitespace) {
                continue;
            }
    
            const imageTokens = token.tokens.filter(isImageToken);
    
            if (imageTokens.length > 1) {
                const galleryToken: ImageGalleryToken = {
                    type: 'image_gallery',
                    raw: token.raw,
                    images: imageTokens,
                };
                tokens[i] = galleryToken;
            }
        }
    
        return tokens;
    }

	async prepare() {
	  this.extensions.forEach(async ext => await ext.prepare());
	}

	async postprocess(html: string): Promise<string> {
		// 使用 DOMParser 或一个临时的 div 来安全地操作 HTML
		const tempDiv = document.createElement('div');
		tempDiv.innerHTML = html;

		// 查找所有需要设置样式的图片
		const images = tempDiv.querySelectorAll('img.note-mp-styled-image');

		images.forEach(img => {
			// 为图片本身添加基础样式
			img.setAttribute('style', 'max-width: 100%; height: auto; display: block;');

			// 检查它是否被 <figure> 包裹
			const parent = img.parentElement;
			if (parent && parent.tagName.toLowerCase() === 'figure') {
				// 如果是，为 <figure> 元素添加 flex 布局样式
				parent.setAttribute('style', 'display: flex; flex-direction: column; align-items: center;');
			}
		});

        // 遍历所有扩展，执行它们各自的 postprocess
		let result = tempDiv.innerHTML;
		for (let ext of this.extensions) {
			result = await ext.postprocess(result);
		}
		return result;
	}

	async parse(content: string) {
		if (!this.marked) await this.buildMarked();
		await this.prepare();

		// 步骤 1: Lexer - 保持不变
		let tokens = this.marked.lexer(content);

		// 步骤 2: 自定义 Token 处理 - 保持不变
		tokens = this.processImageGalleries(tokens);

		// ==================== 新增的关键修复步骤 ====================
		// 步骤 2.5: 手动执行所有扩展的 walkTokens 钩子
		const walkers: ((token: any) => Promise<void> | void)[] = [];
		for (const ext of this.extensions) {
			const markedExt = ext.markedExtension();
			// 找到所有定义了 walkTokens 的扩展
			if (markedExt.walkTokens) {
				// 将 walker 函数绑定其正确的 this 上下文（即扩展实例本身）后收集起来
				walkers.push(markedExt.walkTokens.bind(ext));
			}
		}

		// 如果存在需要执行的 walker
		if (walkers.length > 0) {
			// 异步地遍历所有 token
			for (const token of tokens) {
				// 让每个 walker 都处理一遍当前的 token
				for (const walker of walkers) {
					await walker(token);
				}
			}
		}
		// ==========================================================

		// 步骤 3: Parser - 现在可以安全地同步调用
		// 因为 blockquote 等异步工作已在上面手动完成，并已将结果存入 token.html
		let html = this.marked.parser(tokens);  

		// 步骤 4: Post-process - 保持不变
		html = await this.postprocess(html);
		return html;
	}
}