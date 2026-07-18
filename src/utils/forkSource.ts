// src/utils/forkSource.ts
// AGPL §13 源码入口：优先指向本次部署的确切 commit（构建期由 vite 注入 __COMMIT_HASH__，
// Azure Actions 构建 fork-release 时即部署的那个 commit）；非真实 SHA（如无 git 的本地 dev）回退仓库根。

const FORK_REPO_URL = 'https://github.com/VTB-LINK/folia-major-fork';

// __COMMIT_HASH__ 为短 SHA，可能带 "/codename" 后缀，取 '/' 前的原始 hash。
const rawCommit = typeof __COMMIT_HASH__ !== 'undefined' ? __COMMIT_HASH__ : '';
const commitSha = rawCommit.split('/')[0];
const isRealSha = /^[0-9a-f]{7,40}$/.test(commitSha);

export const FORK_SOURCE_URL = isRealSha ? `${FORK_REPO_URL}/commit/${commitSha}` : FORK_REPO_URL;
export const FORK_SOURCE_LABEL = 'VTB-LINK/folia-major-fork';
