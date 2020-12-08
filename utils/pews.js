"use strict";
const Events = require("events"),
    https = require("https"),
    moment = require("moment"),
    fuils = {
        lpad: (str, len) => {
            while (str.length < len) str = "0" + str;
            return str;
        },
        headerLen: 4,
        maxEqkStrLen: 60,
        maxEqkInfoLen: 120,
        ra: ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"],
        staList: []
    }
class Pews extends Events.EventEmitter {
    islog = false;
    sim = false;
    servertime = moment().subtract(32401000, "milliseconds");
    serverURL = "/pews/data/";
    p_phase = 1;
    lasteqk;
    constructor(islog) {
        super();
        this.Start();
        this._sTimeSet();
    }
    Log(...arg) {
        if (!this.islog) return;
        console.log("[Pews Module]", ...arg);
    }
    Start() {
        setInterval(() => {
            this._pewsRequest();
        }, 1000);
    }
    _sTimeFormat() {
        return moment(this.servertime).format("YYYYMMDDHHmmss");
    }
    _pewsRequest() {
        this._HTTP(this.serverURL + this._sTimeFormat() + ".b")
            .then(arg => {
                if (arg[2].statusCode !== 200) return console.log(arg[2].statusCode, this.serverURL + this._sTimeFormat() + ".b");
                const bin = new Uint8Array(arg[0]);
                let binaryStr = "", header = "";
                for (let i = 0; i < fuils.headerLen; i++)
                    header += fuils.lpad(bin[i].toString(2), 8);
                for (let i = fuils.headerLen; i < bin.byteLength; i++)
                    binaryStr += fuils.lpad(bin[i].toString(2), 8);
                let phase = 1;
                if (header.substr(1, 1) == "0") phase = 1;
                else if (header.substr(1, 1) == "1" && header.substr(2, 1) == "0") phase = 2;
                else if (header.substr(2, 1) == "1") phase = 3;
                if (this.p_phase !== phase) this.emit("pewsphaseChange", phase, this.servertime.unix());
                this.p_phase = phase;
                this.emit("pewsPhase", phase, this.servertime.unix());
                if (!this.sim && !this.lasteqk) this.lasteqk = "20" + parseInt(header.substr(6, 26), 2);
                if (phase == 1) return;
                let data = binaryStr.substr(0 - ((fuils.maxEqkStrLen * 8 + fuils.maxEqkInfoLen))),
                    originLat = 30 + (parseInt(data.substr(0, 10), 2) / 100),
                    originLon = 124 + (parseInt(data.substr(10, 10), 2) / 100),
                    eqkMag = (parseInt(data.substr(20, 7), 2) / 10).toFixed(1),
                    eqkDep = parseInt(data.substr(27, 10), 2) / 10,
                    eqkTime = Number(parseInt(data.substr(37, 32), 2) + "000"),
                    eqkId = "20" + parseInt(data.substr(69, 26), 2),
                    eqkMax = parseInt(data.substr(95, 4), 2),
                    eqkMaxAreaStr = data.substr(99, 17),
                    eqkMaxArea = [];
                eqkDep = eqkDep ? eqkDep : "-";
                if (eqkMaxAreaStr !== "11111111111111111") {
                    for (let i = 0; i < 17; i++)
                        if (eqkMaxAreaStr.charAt(i) == "1")
                            eqkMaxArea.push(fuils.ra[i]);
                }
                else eqkMaxArea.push("-");
                const ep = eqkId + "|" + phase;
                if (this.lasteqk !== ep) {
                    this.lasteqk = ep;
                    let infoStrArr = [];
                    for (let i = bin.byteLength - fuils.maxEqkStrLen; i < bin.byteLength; i++) {
                        infoStrArr.push(bin[i]);
                    }
                    this.emit("pewsInfo", phase, this.servertime.unix(), {
                        lat: originLat,
                        lon: originLon,
                        mag: eqkMag,
                        dep: eqkDep,
                        time: eqkTime,
                        id: eqkId,
                        max: eqkMax,
                        areas: eqkMaxArea,
                        loc: decodeURIComponent(escape(String.fromCharCode.apply(null, infoStrArr))).trim()
                    });
                    setTimeout(this._getGrid(eqkId, phase), 200);
                }
            })
            .catch(e => {
                this.Log("오류", e.message);
            })
            .finally(() => {
                this.emit("tick", this.serverURL + this._sTimeFormat() + ".b", this._sTimeFormat());
            });
    }
    _HTTP(path) {
        return new Promise((resolve, reject) => {
            const r = https.request({
                hostname: "www.weather.go.kr",
                path: path,
                method: "GET",
                timeout: 1000
            }, (res) => {
                res.once("data", (d) => {
                    resolve([d, this.servertime, res]);
                });
            });
            r.once("error", (err) => {
                reject(err);
            });
            r.end();
        });
    }
    _sTimeSet() {
        let a = 0;
        if (!this.sim) https.request("https://www.weather.go.kr/pews/", (r) => {
            a = moment.unix(Number(r.headers["st"])).subtract(32401000, "milliseconds");
        }).end();
        setInterval(() => {
            if (!this.sim) this.servertime = a.add(1, "seconds");
            else this.servertime = this.servertime.add(1, "seconds");
        }, 1000);
    }
    _getGrid(id, phase) {
        this._HTTP(`${this.serverURL}${id}.${(phase == 2 ? "e" : "i")}`)
            .then(arg => {
                const arrayBuffer = arg[0];
                if (arrayBuffer && arg[2].statusCode == 200) {
                    const byteArray = new Uint8Array(arrayBuffer);
                    let gridArr = [];
                    for (let i = 0; i < byteArray.length; i++) {
                        const gridStr = fuils.lpad(byteArray[i].toString(2), 8);
                        gridArr.push(parseInt(gridStr.substr(0, 4), 2));
                        gridArr.push(parseInt(gridStr.substr(4, 4), 2));
                    }
                    if (gridArr.length < 17666)
                        setTimeout(this._getGrid(id, phase), 200);
                    this.emit("pewsGrid", gridArr, phase, this.servertime.unix());
                }
            })
            .catch(e => {
                this.Log("오류", e.message);
            })
            .finally(() => {
                this.emit("tick", `${this.serverURL}${id}.${(phase == 2 ? "e" : "i")}`, this._sTimeFormat());
            });
    }
    StopSimulation() {
        this.sim = false;
        this.serverURL = "/pews/data/";
        this.servertime = 0;
        fuils.headerLen = 4;
        fuils.staList = []
        this.lasteqk = null;
        this.emit("reset");
    }
    StartSimulation(id, time) {
        this.sim = true;
        this.serverURL = "/pews/data/" + id + "/";
        this.servertime = moment(time.substr(0, 8)).hours(time.substr(8, 2)).minutes(time.substr(10, 2)).seconds(time.substr(12, 2));
        fuils.headerLen = 1;
        fuils.staList = [];
        this.lasteqk = null;
        this.emit("reset");
    }
}
module.exports = Pews;