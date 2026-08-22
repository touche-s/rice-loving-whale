/**
 * dsh-maid-whale-pet — host 侧入口
 *
 * 为什么需要 host 侧：DSH 的 client-modules 扫描器只扫描
 * `ctx.loader.entries()`（cordis loader 已加载的插件）。纯 client 插件
 * 没有 host 侧时 loader 不会加载它，`dsh.client` 声明也就不会被发现。
 * 本文件提供一个空 host 插件：无行为，仅让 loader 加载本包，从而把
 * `dsh.client` 声明和 `./client` bundle 注入 DSH Web。
 */
'use strict';

const name = 'maid-whale-pet';
const inject = [];

function apply(ctx) {
  // host 侧无行为；client 侧由 client-modules 自动注入浏览器
  ctx.effect(() => () => {}, 'maid-whale-pet: noop host');
}

module.exports = { apply, inject, name };
