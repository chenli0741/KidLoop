# Little Tree 线路配置记录（2026-09-08）

已在当前 Fall 2026 学期实际建立三条草稿：

- Little Tree 1：Cumberland → Cherry Chase → Little Tree Sunnyvale。
- Little Tree 2：Cumberland → Little Tree Sunnyvale。
- Cherry Chase Early Pickup：Ariel Tuan、Juliet Criak 单独早接至 Little Tree，两人已从 Little Tree 1 候选名单移除。

用户确认：常规由 Driver Lina 使用 Little Tree 1 顺序跑两趟。早放学包括 12:45，并非仅 11:45；当前周五由 Driver Chen 带第一趟，随后继续既有 McAuliffe、Stratford 两趟，合计三趟。双车时第二趟由 Lina 使用 Little Tree 2，同时在 Cumberland 接人，不按先后划分孩子。Cumberland 需共享候选名单，由实际点击 Pickup 决定归属。

车辆已绑定：Little Tree 1 与 Cherry Chase 早接使用 1 号车；Little Tree 2 绑定 2 号车，两辆均为 12 座。普通单车连跑时优先使用 1 号车的要求已记录，仍需在具体日期排班中落实。

待确认，暂不启用：

- 两名 Cherry Chase 孩子的早接时间、适用日期及司机。用户确认了两名孩子，照片仅标注 9/8 前 TK 11:35、9/9 全天，不能据此把全学期设为早接。
- Cumberland 当前 23 名候选学生，普通周一、二加 Cherry Chase 其余 5 人共 28 人，仍超过两趟共 24 座；周三、四亦超过。需要明确另外的接送批次或实际候选范围，不能为满足容量任意删人。
- 周五 Cumberland 的 2 名 G4 在 14:30 放学，不能跟 12:45 的早接批次混排。
- 站间行驶时间未确认，草稿时间留空，不能据猜测启用。

草稿中的学生是待核对完整候选名单；两个 Cumberland 名单重复不代表重复派车。当前每日共享功能仍需已有可执行车次，不等于已实现固定线路每个工作日自动生成共享批次和按校历切换司机。启用前必须补齐这部分安排。

数据库操作备份和脚本：Git 忽略目录 `.local-data/little-tree-routes/`。两校地址按用户名单补入空字段。迁移 027 支持草稿未定时刻及说明；启用仍要求完整有效时刻、司机车辆和容量。数据库草稿和车辆绑定已保存；本次代码提交支持线路名称、说明和未定时刻，不代表草稿已启用。
