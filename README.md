# node-thread-worker-group

## 说明

网址: https://github.com/mailhonor/node-thread-worker-group

npm i thread-worker-group

注意: 下划线开头的方法/变量不应该使用

## 接口

```ts
// 请求
export interface ServiceRequest {
  // 数据
  data: any
  // 通知消息接收器, 请注意: 不是此"请求"的返回的处理函数
  tipReceiver?: TipReceiver
  // 可以指定 workerId
  workerId?: string
}

// 通知消息接收器
export type TipReceiver = (data: any) => void

// 请求的返回结果
export interface ServiceResponse {
  // 框架上的返回状态, 空表示正常
  status: string
  // 返回的数据
  data: any
}

// 创建worker线程组的 选项
export interface WorkerGroupOptions {
  // 脚本路径
  scriptPathname: string
  // 是否独占模式(如:cpu密集型), 如果是则每个worker同时只处理一个请求
  exclusive?: boolean
  // 是否开启 debug
  debug?: boolean
}

// 创建一个worker的选项
export interface WorkerOptions {
  // 可以指定worker的id
  workerId?: string
  // 传递给worker的数据
  workerData?: any
  // node原生的创建worker的选项
  workerOriginalOptions?: any
}

// 统计信息
export interface workerGroupStatistics {
  // 所有请求的数量
  enteredCount: number
  // 已经处理完毕的请求的数量 
  dealedCount: number
}

// worker端, 消息通知发送器
export type ThreadTipSender = (data: any) => void

// worker端, 模块请求
export interface ThreadJobRequest {
  data: any
  tipSender: ThreadTipSender
}

export interface ThreadJobResponse {
  data: any
}

export type ThreadJobHandler = (req: ThreadJobRequest) => Promise<ThreadJobResponse>
```

## 方法: 主线程端

```ts
import * as threadWorkerGroup from "thread-worker-group"

// 返回是否主线程
threadWorkerGroup.isMainThread()
```

### 创建worker组

```ts
var wg = new threadWorkerGroup.workerGroup({
  scriptPathname: __filename,
  /* exclusive: false, */
})
```

### 创建一个worker

```ts
wg.createWorker({
  workerId: "id123",
  workerData: "xxx",
})

wg.createWorker({
  workerData: {a: "ccc"},
})

wg.createWorker({ })
```

### 发起请求

```ts
// 是Promise, 没有 catch
wg.request({
  data: {a: 123, b: "xxx"},
}).then((res:ServiceResponse) => {
  console.log("response:", res.status, res.data)
})

wg.request({
  data: {a: 123, b: "xxx"},
  workerId: "id123",
}).then((res:ServiceResponse) => {
  console.log("response:", res.status, res.data)
})

wg.request({
  data: {a: 123, b: "xxx"},
  tipReceiver: (tip: any) => {
    console.log(tip)
  },
}).then((res:ServiceResponse) => {
  console.log("response:", res.status, res.data)
})
```

### 统计信息

```ts
var st:workerGroupStatistics = wg.statistics
```

### 注册全局通知消息接收器

```ts
function handler(data: any) {
  console.log(data)
}
wg.registerGlobalTipReceiver("somename", handler)
```


## 方法: 子线程(worker)端

```ts
const threadWorkerGroup = require("thread-worker-group")
// 返回是否主线程
threadWorkerGroup.isMainThread()
```

### 注册处理函数

```ts
// 必须是 async 的
const handler = async (req: ) => {
  var i = 0;
  for (i = 0; i < 100; i++) {
    req.tipSender({ data: i})
    req.tipSender("xxx")
  }
  return { data: "something" }
}

threadWorkerGroup.threadRegisterHandler(handler)
```

### 全局通知消息

```ts
threadWorkerGroup.threadGlobalTipSender("somename", anydata)
```

### 获取 workerData

```ts
var d = threadWorkerGroup.threadGetWorkerData();
```
