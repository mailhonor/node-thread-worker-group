import { Worker as NodeWorker, workerData, parentPort, isMainThread as _isMainThread, threadId } from 'worker_threads'

export interface ServiceRequest {
    data: any
    //
    tipReceiver?: TipReceiver
    //
    workerId?: string
}

export type TipReceiver = (data: any) => void

export interface ServiceResponse {
    status: string
    data: any
}

type ServiceResolve = (res: ServiceResponse) => void

interface ChannelRequest {
    workerId?: string
    sn: string
    data: any
    haveTipReceiver: boolean
}

interface ChannelResponse {
    sn: string
    status: string
    data: any
}

interface ChannelData {
    channel: string,
    data: any,
}

interface ServiceRequestRecord {
    resolve: ServiceResolve
    tipReceiver?: TipReceiver
}

interface Worker {
    workerId: string
    thread: NodeWorker
    currentCount: number
}

export interface WorkerGroupOptions {
    scriptPathname: string
    exclusive?: boolean
    debug?: boolean
}

export interface WorkerOptions {
    workerId?: string
    workerData?: any
    workerOriginalOptions?: any
}

export interface WorkerGroupStatistics {
    enteredCount: number
    dealedCount: number
}

export type MainTipSender = (data: any) => void
export interface MainJobRequest {
    data: any
    tipSender: MainTipSender
}

export interface MainJobResponse {
    data: any
}

export type MainJobHandler = (req: MainJobRequest) => Promise<MainJobResponse>

let groupdIdPlus = 1
let groupIdPrefix = (new Date()).getTime()
export class workerGroup {
    private _groupId = groupIdPrefix + "_" + (groupdIdPlus++)
    private _statistics: WorkerGroupStatistics
    private _workerIdPlus: number
    private _serviceIdPlus: number
    private _scriptPathname: string
    private _workerSet: { [key: string]: Worker }
    private _exclusive: boolean
    private _exclusiveReqList: ChannelRequest[]
    private _mainRequestSet: { [key: string]: ServiceRequestRecord }
    private _tipReceiver: TipReceiver
    private _jobHandler: MainJobHandler
    constructor(options: WorkerGroupOptions) {
        this._statistics = { enteredCount: 0, dealedCount: 0 }
        this._workerIdPlus = 100
        this._serviceIdPlus = 100
        this._scriptPathname = options.scriptPathname;
        this._workerSet = {}
        this._exclusive = (options.exclusive === true)
        this._exclusiveReqList = []
        this._mainRequestSet = {}
        this._tipReceiver = (data: any) => {
            console.log("receiver tips:", data)
        }
        this._jobHandler = async (req) => {
            return { data: { echo: req.data, desc: "default handler" } }
        }
    }

    getStatistics = () => {
        return this._statistics
    }

    private __exclusive_check_once(): boolean {
        let channel_req = this._exclusiveReqList.shift()
        if (!channel_req) {
            return false
        }
        let workerId = channel_req.workerId
        let wk: Worker | null = null
        let ws = this._workerSet
        let key: string
        if (workerId !== undefined) {
            wk = ws[workerId]
            if (!wk) {
                this.__resolve({ sn: channel_req.sn, status: "WORKER-NONEEXISTS", data: {} })
                return true
            }
            this.__service_post(wk, channel_req)
            return true
        }
        for (key in ws) {
            let w = ws[key]
            if (w.currentCount > 0) {
                continue
            }
            wk = w
            break
        }
        if (!wk) {
            this._exclusiveReqList.unshift(channel_req)
            return false
        }
        this.__service_post(wk, channel_req)
        return true
    }

    private __exclusive_check() {
        if (!this._exclusive) {
            return
        }
        while (this.__exclusive_check_once());
    }

    private __service_post(worker: Worker, req: ChannelRequest) {
        worker.currentCount++
        worker.thread.postMessage({ channel: "request", data: req })
    }

    private __resolve(msg: ChannelResponse) {
        this._statistics.dealedCount++
        let rs = this._mainRequestSet[msg.sn]
        if (!rs) {
            return
        }
        delete this._mainRequestSet[msg.sn]
        rs.resolve({ status: msg.status, data: msg.data })
    }

    private __child_on_message_response(workerId: string, msg: ChannelResponse) {
        let ws = this._workerSet
        let wk = ws[workerId]
        if (!wk) {
            return
        }
        let sn = msg.sn
        let data = msg.data
        // 全局 tips 通知
        if (sn == "tip") {
            this._tipReceiver(data)
            return
        }
        // 模块 tip 通知
        if (sn.startsWith("tip/")) {
            sn = sn.substring(4)
            let rs = this._mainRequestSet[sn]
            if (rs && rs.tipReceiver) {
                rs.tipReceiver(data)
            }
            return
        }
        let rs = this._mainRequestSet[sn]
        if (!rs) {
            return
        }
        wk.currentCount--
        this.__exclusive_check()
        this.__resolve(msg)
    }

    private __child_on_message_request(workerId: string, req: ChannelRequest) {
        let sn = req.sn
        let ws = this._workerSet[workerId]
        let mreq: MainJobRequest = {
            data: req.data,
            tipSender: (data: any) => { },
        }
        if (req.haveTipReceiver) {
            mreq.tipSender = (data: any) => {
                ws.thread.postMessage({ channel: "response", data: { sn: "tip/" + sn, status: "", data: data } })
            }
        }
        this._jobHandler(mreq).then(res => {
            ws.thread.postMessage({ channel: "response", data: { data: res.data, sn: sn, status: "OK" } })
        })
    }

    private __child_on_message(workerId: string, channelData: ChannelData) {
        let channel = channelData.channel
        if (channel == "response") {
            return this.__child_on_message_response(workerId, channelData.data)
        } else if (channel == "request") {
            return this.__child_on_message_request(workerId, channelData.data)
        }
    }

    async createWorker(attrs: WorkerOptions) {
        let that = this
        let ws = this._workerSet
        let workerId = ""
        if (attrs.workerId !== undefined) {
            workerId = attrs.workerId.toString()
        } else {
            this._workerIdPlus++
            workerId = "_wkg_20240109_" + this._workerIdPlus
        }
        return new Promise((resolve) => {
            if (ws[workerId]) {
                resolve(ws[workerId])
                return
            }

            let options: any = {}
            if (attrs.workerOriginalOptions) {
                options = attrs.workerOriginalOptions
                options = { ...options }
            }
            if (options.stdout === undefined) {
                options.stdout = false
            }
            if (options.stderr === undefined) {
                options.sterr = false
            }
            if (attrs.workerData !== undefined) {
                options.workerData = attrs.workerData
            }
            let thread = new NodeWorker(this._scriptPathname, options)
            let wk: Worker = {
                workerId: workerId,
                thread: thread,
                currentCount: 0,
            }
            ws[workerId] = wk
            resolve(wk)

            thread.on("message", (e: any) => {
                that.__child_on_message(workerId, e)
            })

            thread.stdout!.on("data", (e) => {
                console.log(`${e}`)
            })
            thread.stderr!.on("data", (e) => {
                console.error(`${e}`)
            })

            thread.postMessage({ channel: "welcome", data: { workerId, exclusive: that._exclusive } });
        })
    }

    private async __request(req: ServiceRequest): Promise<ServiceResponse> {
        let that = this
        let ws = this._workerSet
        const data = req.data
        const workerId = req.workerId
        const tipReceiver = req.tipReceiver
        this._serviceIdPlus++;
        const channel_req: ChannelRequest = {
            workerId,
            sn: "R" + this._serviceIdPlus,
            data: data,
            haveTipReceiver: (tipReceiver ? true : false),
        }

        return new Promise((resolve: ServiceResolve) => {
            let wk: Worker | null
            let key: string

            that._statistics.enteredCount++
            that._mainRequestSet[channel_req.sn] = { resolve: resolve, tipReceiver: tipReceiver }

            // 如果指定了worker
            if (workerId !== undefined) {
                wk = ws[workerId]
                // worker 不存在
                if (!wk) {
                    that.__resolve({ sn: channel_req.sn, status: "NONEEXISTS-WORKER", data: {} });
                    return
                }
                if (that._exclusive) {
                    that._exclusiveReqList.push(channel_req)
                    return
                }
                that.__service_post(wk, channel_req)
                return
            }

            // cpu 密集型 慢操作, 一个线程一个
            if (that._exclusive) {
                that._exclusiveReqList.push(channel_req)
                return
            }

            // 非密集型的
            let count = 999999999
            wk = null
            for (key in ws) {
                let w = ws[key]
                if (w.currentCount < count) {
                    count = w.currentCount
                    wk = w
                }
            }
            if (!wk) {
                that.__resolve({ sn: channel_req.sn, status: "NONEEXISTS-ANY-WORKER", data: {} });
                return
            }
            that.__service_post(wk, channel_req)
            return
        });
    }
    async request(req: ServiceRequest): Promise<ServiceResponse> {
        let r = this.__request(req)
        this.__exclusive_check();
        return r
    }
    registerTipReceiver(handler: TipReceiver) {
        this._tipReceiver = handler
    }
    registerHandler = (handler: MainJobHandler) => {
        this._jobHandler = handler
    }
}

// thread 环境下
export type ThreadTipSender = (data: any) => void
export interface ThreadJobRequest {
    data: any
    tipSender: ThreadTipSender
}

export interface ThreadJobResponse {
    data: any
}

export type ThreadJobHandler = (req: ThreadJobRequest) => Promise<ThreadJobResponse>

interface ThreadGlobalVars {
    handler: ThreadJobHandler
    workerId: string,
    exclusive: boolean
    exclusiveReqList: ChannelRequest[]
    exclusiveRunning: boolean
    welcome: boolean
    welcomeData: any
    serviceIdPlus: number
    requestSet: { [key: string]: ServiceRequestRecord }
}

async function __thread_run_one_request(gvars: ThreadGlobalVars, req: ChannelRequest) {
    let res: ThreadJobResponse
    let sn = req.sn
    let handler: ThreadJobHandler | undefined = gvars.handler
    let mreq: ThreadJobRequest = {
        data: req.data,
        tipSender: (data: any) => { },
    }
    if (req.haveTipReceiver) {
        mreq.tipSender = (data: any) => {
            if (parentPort) {
                parentPort.postMessage({ channel: "response", data: { sn: "tip/" + sn, status: "", data: data } })
            }
        }
    }
    gvars.exclusiveRunning = true
    let status = ""
    if (handler === undefined) {
        status = "THREAD-NO-HANDLER"
        res = { data: {} }
    } else {
        try {
            res = await handler(mreq)
        } catch {
            status = "PTRHEAD-PROMISE-CATCH"
            res = { data: {} }
        }
    }
    gvars.exclusiveRunning = false
    if (parentPort) {
        parentPort.postMessage({ channel: "response", data: { sn: sn, status: status, data: res.data } })
    }
    __thread_check_exclusiveReqList(gvars)
}

function __thread_check_exclusiveReqList_once(gvars: ThreadGlobalVars): boolean {
    if (gvars.exclusiveRunning) {
        return false
    }
    let req = gvars.exclusiveReqList.shift()
    if (!req) {
        return false
    }
    __thread_run_one_request(gvars, req)
    return true;
}

function __thread_check_exclusiveReqList(gvars: ThreadGlobalVars) {
    if (!gvars.exclusive) {
        return
    }
    while (__thread_check_exclusiveReqList_once(gvars));
}

function __thread_receive_message(gvars: ThreadGlobalVars, channelData: ChannelData) {
    if (gvars.welcome) {
        let channel = channelData.channel
        if (channel == "request") {
            let req: ChannelRequest = channelData.data
            if (gvars.exclusive) {
                gvars.exclusiveReqList.push(req)
                __thread_check_exclusiveReqList(gvars)
            } else {
                __thread_run_one_request(gvars, req)
            }
        } else if (channel == "response") {
            let msg: ChannelResponse = channelData.data
            let sn = msg.sn
            let data = msg.data
            // 模块 tip 通知
            if (sn.startsWith("tip/")) {
                sn = sn.substring(4)
                let rs = gvars.requestSet[sn]
                if (rs && rs.tipReceiver) {
                    rs.tipReceiver(data)
                }
                return
            }
            let rs = gvars.requestSet[sn]
            if (!rs) {
                return
            }
            delete gvars.requestSet[sn]
            rs.resolve({ status: msg.status, data: msg.data })
        }
    } else {
        gvars.welcome = true
        gvars.welcomeData = channelData.data
        gvars.exclusive = channelData.data.exclusive
        gvars.workerId = channelData.data.workerId
    }
}

function __init_thread_and_get_global_vars(): ThreadGlobalVars {
    let g: any = global
    if (g.___linuxmail_worker_group_20240104___) {
        return g.___linuxmail_worker_group_20240104___
    }
    let gvars: ThreadGlobalVars = {
        handler: async (req) => { return { status: "PTRHEAD-NO-HANDLER", data: {} } },
        workerId: "-1",
        exclusive: false,
        exclusiveReqList: [],
        exclusiveRunning: false,
        welcome: false,
        welcomeData: {},
        serviceIdPlus: 1,
        requestSet: {},
    }
    g.___linuxmail_worker_group_20240104___ = gvars

    if (parentPort) {
        parentPort.on('message', (req) => { __thread_receive_message(gvars, req) })
    }

    return gvars
}

export const threadRegisterHandler = (handler: ThreadJobHandler) => {
    let gvars = __init_thread_and_get_global_vars()
    gvars.handler = handler
}

export const threadTipSender = (data: any) => {
    if (parentPort) {
        parentPort.postMessage({ channel: "response", data: { sn: "tip", status: "", data: data } })
    }
}

export const threadRequest = async (req: ServiceRequest): Promise<ServiceResponse> => {
    req = { ...req }
    let gvars = __init_thread_and_get_global_vars()
    gvars.serviceIdPlus++
    let sn = "R" + gvars.serviceIdPlus
    const channel_req: ChannelRequest = {
        sn,
        data: req.data,
        haveTipReceiver: (req.tipReceiver ? true : false),
    }
    return new Promise((resolve: ServiceResolve) => {
        gvars.requestSet[sn] = { resolve: resolve, tipReceiver: req.tipReceiver }
        if (parentPort) {
            parentPort.postMessage({ channel: "request", data: channel_req })
        }
    })
}

export const isMainThread = () => {
    return _isMainThread ? true : false
}
export const threadGetWorkerData = () => {
    if (_isMainThread) {
        return undefined
    } else {
        return workerData
    }
}
