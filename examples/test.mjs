// const threadWorkerGroup = require("thread-worker-group")
import * as threadWorkerGroup from "../dist/index.mjs"
const fileUrl = new URL(import.meta.url)
const __filename = fileUrl.pathname

// main
function main_create_worker_group(exclusive) {
    var moduleTipCount = 0, globalTipCount = 0
    exclusive = (exclusive === true)
    var title = "1111111111"
    var workerData = "aaa"
    var special_workerId = "id123"
    if (exclusive) {
        title = "2222222222"
        workerData = "bbb"
        special_workerId = "id456"

    }

    var wg = new threadWorkerGroup.workerGroup({ scriptPathname: __filename, exclusive: exclusive })

    wg.registerHandler(async (req) => {
        console.log("mainnnnnnnnnnnnnnnnnnnnnnnn handler:", req.data)
        req.tipSender("mainnnnnnnnnnnnnnnnnnnnnnnn tippppppppppppppppppppppppp 1")
        req.tipSender("mainnnnnnnnnnnnnnnnnnnnnnnn tippppppppppppppppppppppppp 2")
        return { data: "response" }
    })

    wg.registerTipReceiver((data) => {
        console.log(title, "global tip:", data)
        globalTipCount++
    })
    wg.createWorker({
        workerData: workerData,
        workerOriginalOptions: {
            stdout: true
        }
    })
    wg.createWorker({
        workerData: workerData,
    })
    wg.createWorker({
        workerId: special_workerId,
        workerData: workerData,
    })

    function do_one() {
        var i = 0;
        for (i = 0; i < 1000; i++) {
            if (1) {
                // 普通请求
                wg.request({ data: i }).then(res => {
                    console.log(title, "response:", res.status, res.data)
                })
            }
            if (i % 10 == 1) {
                // 指定 worker 的 id
                wg.request({ data: i, workerId: special_workerId }).then(res => {
                    console.log(title, "with workerId(" + special_workerId + ") response: ", res.status, res.data)
                });
            }
            if (i % 10 == 2) {
                // 模块消息通知
                wg.request({
                    data: i, tipReceiver: (data) => {
                        console.log(title, "module tip:", data)
                        moduleTipCount++
                    }
                })
            }
        }
    }
    var i;
    for (i = 0; i < (exclusive ? 1 : 100); i++) {
        setTimeout(() => { do_one() }, i * 1000)
    }
    for (i = 0; i < 100; i++) {
        setTimeout(() => { wg.createWorker({ workerData: workerData }) }, i * 1000)
    }

    setInterval(() => {
        var s = wg.getStatistics()
        console.log("######################################", title, "statistics: ", s.enteredCount, s.dealedCount, globalTipCount, moduleTipCount)
    }, 1000)
}

// child
const sleep = async (t) => {
    return new Promise(resolve => { setTimeout(() => { resolve() }, t) })
}

var testi = 0;
const threadHandler_1 = async (req) => {
    var i = 0;
    for (i = 0; i < 3; i++) {
        await sleep(i)
        req.tipSender("sleep " + i)
    }
    await sleep((new Date).getTime() % 10)
    if (testi++ % 10 == 1) {
        await sleep((new Date).getTime() % 10000)
    }
    return { data: req.data }
}

const threadHandler_2 = async (req) => {
    var i = 0;
    for (i = 0; i < 3; i++) {
        await sleep(10 + i)
        req.tipSender("sleep " + i)
    }
    await sleep((new Date).getTime() % 100)
    return { data: req.data }
}

const child_run = () => {
    var wd = threadWorkerGroup.threadGetWorkerData()
    console.log("onstart, child workerData:", wd)
    if (wd === 'aaa') {
        threadWorkerGroup.threadRegisterHandler(threadHandler_1)
        setInterval(() => {
            threadWorkerGroup.threadTipSender("ppp")
        }, 2000)
    } else {
        threadWorkerGroup.threadRegisterHandler(threadHandler_2)
        setInterval(() => {
            threadWorkerGroup.threadTipSender("ggg", "c-" + (new Date).toString())
        }, 5000)
    }
    setTimeout(() => {
        console.log("####################################################################################### thread env, console test")
    }, 5000)
    setTimeout(() => {
        threadWorkerGroup.threadRequest({
            data: "mainnnnnnnnnnnnnnnnnnnnnnnn request" + (new Date()),
            tipReceiver: (data) => {
                console.log("mainnnnnnnnnnnnnnnnnnnnnnnn receive tip", data)
            }
        }).then((res) => {
            console.log("mainnnnnnnnnnnnnnnnnnnnnnnn result:", res)
        })
    }, 1000)
    //
}

// go

if (threadWorkerGroup.isMainThread()) {
    main_create_worker_group(false)
    main_create_worker_group(true)
} else {
    child_run()
}