# Changelog

## Unreleased

### Added

- 新增性能诊断工具：`record_performance`、`start_performance_recording`、`stop_performance_recording`、`get_performance_report` 和 `take_heap_snapshot`。无调试权限时走 Hook 采样，拿到调试权限时升级为 CDP CPU profile 和 heap snapshot；原始 profile 与 heap 文件由服务端落盘，不直接塞进 MCP 响应。

### Fixed

- 修复 issue #1 中 Vue runtime bridge 初始化竞态，确保 Vue app 挂载前同步初始化 devtools hook，避免 `get_component_tree` 返回 `null`，并恢复 `get_component_state`、`get_router_info` 等 Vue 语义工具的初始化前置条件。
