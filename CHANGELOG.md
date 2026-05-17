# Changelog

## Unreleased

### Fixed

- 修复 issue #1 中 Vue runtime bridge 初始化竞态，确保 Vue app 挂载前同步初始化 devtools hook，避免 `get_component_tree` 返回 `null`，并恢复 `get_component_state`、`get_router_info` 等 Vue 语义工具的初始化前置条件。
