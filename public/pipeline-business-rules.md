# Pipeline Dashboard 业务规则文档

## 一、数据结构关系

### 1.1 核心表结构

```
skus (SKU主数据)
├── id                    # SKU唯一标识 (如 "60342GT")
├── sku_code              # SKU编码 (应与id一致)
├── part_model            # 零件型号
├── description           # 描述
├── category              # 类别 (如 "COUNTERWEIGHT")
├── supplier_code         # 供应商代码 (如 "TJJSH", "HX")
├── warehouse             # 仓库 (如 "Kent", "Moses Lake")
├── lead_time_weeks       # 交货周期 (统一6周)
├── moq                   # 最小订购量
├── abc_class             # ABC分类 (A/B/C)
├── xyz_class             # XYZ分类 (X/Y/Z)
├── safety_stock_weeks    # 安全库存周数 (默认4)
├── unit_cost             # 单位成本
└── unit_weight           # 单位重量

inventory_data (库存周数据)
├── sku_id                # 关联 skus.id
├── week_number           # 周号 (-3 到 53)
├── etd                   # 出货数量 (用户输入)
├── eta                   # 预计到达 (NULL=自动计算)
├── ata                   # 实际到达 (NULL=自动计算, 或WMS同步)
├── customer_forecast     # 客户预测用量 (从forecast同步)
├── actual_consumption    # 实际消耗 (历史周=WMS同步, 未来周=NULL则用forecast)
├── actual_inventory      # 实际库存 (NULL=自动计算)
└── defect                # 缺陷数量

forecast_multiplier_config (机型-SKU绑定配置)
├── supplier_code         # 供应商代码
├── sku_code              # SKU编码
├── part_model            # 机型名称 (如 "GS-4655", "SX125XC")
└── multiplier            # 用量乘数 (如 1, 2, 3)
```

### 1.2 数据关系图

```
Customer Forecast (PDF/Excel)
    ↓ (按机型识别)
forecast_multiplier_config (机型→SKU绑定+乘数)
    ↓
inventory_data.customer_forecast (SKU周用量)
    ↓
Pipeline计算公式
    ↓
Dashboard显示 / Replenishment Engine
```

---

## 二、核心计算公式

### 2.1 ETA计算 (预计到达)

```javascript
// ETA = 6周前的ETD (统一lead_time = 6周)
if (eta === null) {
  const sourceWeek = weekNumber - 6
  eta = etdByWeek.get(sourceWeek) ?? 0
}
```

### 2.2 ATA计算 (实际到达)

```javascript
// 规则：
// 1. 如果数据库有ATA值 (WMS同步) → 使用该值
// 2. 如果没有WMS同步 → ATA = ETA
// 3. 如果有WMS同步但是部分周 → 延展逻辑处理

// 延展逻辑：
// - 找到最后一个有WMS同步的周 (lastSyncedWeekIndex)
// - 计算累计差值: remainingSyncedAta = totalSyncedAta - totalEtaUpToSynced
// - 后续周: 如果remainingSyncedAta > 0, 则抵扣ETA
// - 直到遇到ETA=0的周，batch结束，后续ATA=ETA
```

### 2.3 Actual Consumption计算 (实际消耗)

```javascript
// 规则：
// - 历史周: 使用WMS同步的actual_consumption
// - 未来周: 如果actual_consumption为NULL → 使用customer_forecast
actualConsumption = actual_consumption !== null 
  ? actual_consumption 
  : customer_forecast
```

### 2.4 Actual Inventory计算 (实际库存)

```javascript
// 递推公式: 从Week 1开始
actualInventory[week] = actualInventory[week-1] 
  - consumption[week] 
  + ata[week]

// 其中:
// - consumption = actualConsumption (已处理fallback到forecast)
// - ata = 实际到达数量
```

### 2.5 Weeks On Hand计算 (库存周数)

```javascript
// 13周滚动平均消耗
function calculateWeeksOnHand(weeks, currentWeekIndex) {
  const currentInventory = weeks[currentWeekIndex].actualInventory
  const startIndex = Math.max(0, currentWeekIndex - 4)
  const endIndex = Math.min(weeks.length - 1, currentWeekIndex + 8)
  
  let totalConsumption = 0
  for (let i = startIndex; i <= endIndex; i++) {
    totalConsumption += weeks[i].actualConsumption ?? weeks[i].customerForecast ?? 0
  }
  
  const avgConsumption = totalConsumption / 13
  
  if (avgConsumption <= 0) {
    return currentInventory > 0 ? 999 : 0
  }
  
  return currentInventory / avgConsumption
}
```

### 2.6 Safety Stock计算 (安全库存)

```javascript
// 公式: SS = Z × σ × √LT × multiplier
// 其中:
// - Z = Z-score (根据service_level查表, 90%→1.28, 95%→1.65)
// - σ = avgWeeklyDemand × cv_demand (cv默认0.5)
// - LT = lead_time_weeks

function computeSafetyStockUnits(avgWeeklyDemand, cvDemand, leadTimeWeeks, serviceLevel, multiplier, targetWoh) {
  const z = getZScore(serviceLevel)  // 90% → 1.28
  const sigmaDemand = avgWeeklyDemand * (cvDemand || 0.5)
  let ss = z * sigmaDemand * Math.sqrt(leadTimeWeeks) * multiplier
  
  // 上限: SS不超过target_woh周的需求量 (客户要求4-6周)
  if (targetWoh > 0) {
    ss = Math.min(ss, avgWeeklyDemand * targetWoh)
  }
  
  return ss
}
```

### 2.7 Reorder Point计算 (再订货点)

```javascript
// ROP = 交货期需求 + 安全库存
ROP = avgWeeklyDemand × leadTimeWeeks + safetyStockUnits
```

### 2.8 Target Inventory计算 (目标库存)

```javascript
// Target = 平均周需求 × 目标库存周数
targetInventory = avgWeeklyDemand × target_woh  // 默认8周
```

---

## 三、Forecast同步规则

### 3.1 机型识别流程

```
1. 从PDF/Excel提取机型名称和周用量
2. 在forecast_multiplier_config表中查找机型→SKU映射
3. 对每个绑定的SKU应用乘数: SKU用量 = 机型用量 × multiplier
4. 更新inventory_data.customer_forecast
```

### 3.2 机型名称匹配

```javascript
// 标准化: 移除空格和连字符, 转小写
const normalizedModel = modelName.toLowerCase().replace(/[-\s]/g, '')

// 查找配置表中的匹配
const skusFromConfig = modelToSkusMap.get(normalizedModel)
```

---

## 四、新SKU添加规则

### 4.1 必需字段 (skus表)

```sql
INSERT INTO skus (id, sku_code, part_model, description, category, 
  supplier_code, warehouse, lead_time_weeks, moq, abc_class, xyz_class)
VALUES (
  '60342GT',     -- id必须与sku_code一致
  '60342GT',     -- sku_code
  '60342GT',     -- part_model
  'TRAY,HOSE',   -- description
  'COUNTERWEIGHT', -- category
  'TJJSH',       -- supplier_code
  'Moses Lake',  -- warehouse
  6,             -- lead_time_weeks (统一6周)
  225,           -- moq
  'A',           -- abc_class (A/B/C)
  'X'            -- xyz_class (X/Y/Z)
);
```

### 4.2 Inventory Data初始化

```sql
-- 正确模式: 未来周字段设为NULL (让系统自动计算)
INSERT INTO inventory_data (sku_id, week_number, etd, eta, ata, 
  customer_forecast, actual_consumption, actual_inventory)
SELECT 
  sku_id,
  week_num,
  0,     -- etd: 默认0
  NULL,  -- eta: NULL让系统从ETD计算
  NULL,  -- ata: NULL让系统从ETA计算
  0,     -- customer_forecast: 等forecast同步填充
  NULL,  -- actual_consumption: NULL则用forecast
  NULL   -- actual_inventory: NULL让系统递推计算
FROM ...

-- 错误模式: 把字段设为0会阻止自动计算!
```

### 4.3 Forecast机型绑定

```sql
INSERT INTO forecast_multiplier_config (supplier_code, sku_code, part_model, multiplier)
VALUES ('TJJSH', '60342GT', 'SX125XC', 3);
-- 表示: SX125XC机型的用量 × 3 = 60342GT的customer_forecast
```

---

## 五、WMS同步规则

### 5.1 认证配置 (lib/wms-auth.ts)

```javascript
const CREDENTIAL_MAP = {
  'Kent|TJJSH': {
    base64EnvKey: 'WMS_BASE64_KEY_KENT_TJJSH',
    loginEnvKey: 'WMS_USER_LOGIN_KENT_TJJSH',
  },
  'Moses Lake|TJJSH': {
    // 使用与Kent相同的认证
    base64EnvKey: 'WMS_BASE64_KEY_KENT_TJJSH',
    loginEnvKey: 'WMS_USER_LOGIN_KENT_TJJSH',
  },
  // 其他仓库|供应商组合...
}
```

### 5.2 同步数据

- **ATA (Actual To Arrival)**: 从WMS接收记录同步
- **Actual Consumption**: 从WMS发货记录同步

---

## 六、Replenishment Engine决策规则

### 6.1 紧急程度判定

```javascript
const urgency = 
  (hasStockoutIn12Weeks || weeksWithPositiveInventory < 4) ? 'CRITICAL'
    : inventoryTrendingDown ? 'WARNING'
    : 'OK'

// CRITICAL: 12周内会断货 或 12周内只有<4周有库存
// WARNING: 库存下降超过50%
// OK: 库存稳定或增长
```

### 6.2 建议生成规则

```javascript
// 当库存 < 4周需求时，建议补货
if (simulatedInventory < avgDemand * 4) {
  const etdWeek = weekNum - leadTimeWeeks
  const orderQty = Math.ceil(avgDemand * 6)  // 补到6周库存
  // 向上取整到MOQ
  suggestedOrderQty = Math.ceil(orderQty / moq) * moq
}
```

---

## 七、AI助手系统提示词

```javascript
const systemPrompt = `You are an intelligent inventory analysis assistant...

Key metrics explanation:
- actual_inventory: Current inventory level
- customer_forecast: Expected customer demand
- actual_consumption: Actual units consumed
- eta (ATA): Arrivals/shipments to add
- defect: Defective units to subtract
- weeks_on_hand: Inventory / Average consumption (13-week rolling average)

When analyzing:
1. Identify SKUs with low weeks_on_hand (< 4 weeks is concerning, < 2 weeks is critical)
2. Look for trends in consumption vs inventory
3. Flag any SKUs that may face stockout risk
4. Provide actionable recommendations

Respond in the same language the user uses. Be concise and specific.`
```

### 7.1 决策边界

| Weeks on Hand | 状态 | 建议 |
|---------------|------|------|
| < 2 weeks | CRITICAL | 立即补货，加急处理 |
| 2-4 weeks | WARNING | 尽快安排补货 |
| 4-6 weeks | OK | 正常监控 |
| > 6 weeks | OK | 库存充足 |

---

## 八、常量配置

```javascript
// 统一配置
const LEAD_TIME_WEEKS = 6        // ETD→ETA转换周数
const SAFETY_STOCK_WEEKS = 4     // 默认安全库存周数
const TARGET_WOH = 8             // 目标库存周数
const ROLLING_AVG_WEEKS = 13     // Weeks on Hand计算的滚动周数
const SERVICE_LEVEL = 0.90       // 默认服务水平 (90%)
const CV_DEMAND = 0.5            // 默认需求变异系数

// Week 1 起始日期
const WEEK1_START = new Date('2025-12-29')  // 2026年Week 1从2025-12-29开始
```
