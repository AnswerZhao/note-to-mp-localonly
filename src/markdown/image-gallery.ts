/*
 * @Author: zwdroid@gmail.com
 * @FilePath: /note-to-mp/src/markdown/image-gallery.ts
 * @Description: 
 * 
 */

import { Tokens, MarkedExtension, Token } from "marked";
import { Extension } from "./extension";
import { LocalFile } from "./local-file";

// 定义自定义的 image_gallery token 类型
export interface ImageGalleryToken extends Tokens.Generic {
  type: 'image_gallery';
  images: (Tokens.Image | Tokens.Generic)[]; // 支持标准图片和本地文件图片
}


export class ImageGallery extends Extension {
    // 渲染单张图片为其 HTML 字符串
    private renderImage(imageToken: Tokens.Image | Tokens.Generic): string {
        if (imageToken.type === 'image') {
            // @ts-ignore
            return this.marked.defaults.renderer.image(imageToken.href, imageToken.title, imageToken.text);
        }
        // 处理 Obsidian 内联图片 ![[...]]
        if (imageToken.type === 'LocalImage') {
            const localFile = this.extensions.find(ext => ext instanceof LocalFile) as LocalFile;
            if (localFile) {
                // @ts-ignore
                return localFile.markedExtension().extensions[0].renderer(imageToken);
            }
        }
        return '';
    }

    markedExtension(): MarkedExtension {
        return {
            extensions: [{
                name: 'image_gallery',
                level: 'block',
                tokenizer(src: string) { return undefined; }, 
                renderer: (token: Tokens.Generic) => {
                    const galleryToken = token as ImageGalleryToken;
                    const images = galleryToken.images;
                    const imageCount = images.length;
                    
                    if (imageCount <= 1) {
                        return `<p>${this.renderImage(images[0])}</p>`;
                    }

                    const renderRow = (imageTokens: (Tokens.Image | Tokens.Generic)[]) => {
                        const imageHtmls = imageTokens.map(img => this.renderImage(img));
                        // 关键修复：为每个图片包裹一个 flex-item 的 div，并为图片本身添加关键的缩放样式
                        const wrappedImages = imageHtmls.map(imgHtml => {
                            // 给 <img> 标签强制添加核心的缩放样式
                            const styledImgHtml = imgHtml.replace(
                                /<img src=/, 
                                '<img style="width: 100%; height: auto; object-fit: contain; display: block;" src='
                            );
                            return `<div style="flex: 1; min-width: 0; display: flex; align-items: center; justify-content: center;">${styledImgHtml}</div>`;
                        }).join('');

                        return `<div style="display: flex; justify-content: space-around; gap: 10px; align-items: stretch;">${wrappedImages}</div>`;
                    };
                    
                    if (imageCount <= 3) {
                        return renderRow(images);
                    } else {
                        const rows: string[] = [];
                        for (let i = 0; i < imageCount; i += 3) {
                            const chunk = images.slice(i, i + 3);
                            rows.push(renderRow(chunk));
                        }
                        return `<div style="display: flex; flex-direction: column; gap: 10px;">${rows.join('')}</div>`;
                    }
                }
            }]
        };
    }
}