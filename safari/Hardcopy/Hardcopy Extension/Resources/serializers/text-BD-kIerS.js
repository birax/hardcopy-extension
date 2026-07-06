var e=`─`.repeat(24),t=`═`.repeat(24),n=`    `;function r(e){let t=[];for(let n of e.items)switch(n.kind){case`metadata`:t.push(i(n));break;case`branchStart`:t.push(a(n));break;case`message`:t.push(o(n));break}let n=t.join(`

`);return n===``?``:n.split(`
`).map(e=>e.replace(/\s+$/u,``)).join(`
`).replace(/\n+$/u,``)+`
`}function i(e){let t=[e.title,`=`.repeat(Math.max([...e.title].length,1))],n=[];return e.createdAt!==void 0&&n.push(`Created: ${e.createdAt.display}`),e.updatedAt!==void 0&&n.push(`Updated: ${e.updatedAt.display}`),n.length>0&&t.push(n.join(` · `)),t.join(`
`)}function a(e){return[t,`Branch ${e.branchIndex+1} of ${e.branchCount}${e.isDefaultBranch?` (current)`:``}`,t].join(`
`)}function o(t){return[e,t.timestamp===void 0?t.senderLabel:`${t.senderLabel} · ${t.timestamp.display}`,``,t.blocks.map(e=>s(e).replace(/\s+$/u,``)).join(`

`)].join(`
`)}function s(e){switch(e.kind){case`text`:return e.text;case`thinking`:return c(e);case`toolUse`:return l(e);case`toolResult`:return u(e);case`artifact`:return d(e);case`image`:return f(e);case`attachment`:return p(e);case`file`:return m(e);case`unknown`:return h(e)}}function c(e){let t=[];return e.summaries.length>0&&t.push(e.summaries.map(e=>`- ${e}`).join(`
`)),e.thinking!==``&&t.push(e.thinking),g(`[Thinking]`,t.join(`

`))}function l(e){return g(`[Tool: ${e.name}]`,v(e.input))}function u(e){return g(`[Tool result${e.name===void 0?``:`: ${e.name}`}${e.isError?` (error)`:``}]`,e.content)}function d(e){return g(`[Artifact: ${e.title??e.id}${e.language===void 0?``:` (${e.language})`}]`,e.content)}function f(e){return e.fileName===void 0?e.mediaType===void 0?`[Image]`:`[Image (${e.mediaType})]`:`[Image: ${e.fileName}]`}function p(e){let t=e.fileType===void 0?``:` (${e.fileType})`;return g(`[Attachment: ${e.fileName}${t}]`,e.extractedContent??``)}function m(e){let t=e.fileKind===void 0?``:` (${e.fileKind})`;return`[File: ${e.fileName}${t}]`}function h(e){return g(`[Unrecognised content: ${e.label}]`,v(e.raw))}function g(e,t){return t===``?e:`${e}\n${_(t)}`}function _(e){return e.split(`
`).map(e=>e===``?``:`${n}${e}`).join(`
`)}function v(e){try{return JSON.stringify(e,null,2)??String(e)}catch{return String(e)}}export{r as serializeText};