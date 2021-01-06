"use strict";
const Events = require("events"),
    fuils = {
        lpad: (str, len) => {
            while (str.length < len) str = "0" + str;
            return str;
        },
        headerLen: 4,
        maxEqkStrLen: 60,
        maxEqkInfoLen: 120,
        binarytimeout: 2000,
        statimeout: 3000,
        gridtimeout: 5000,
        ra: ["서울", "부산", "대구", "인천", "광주", "대전", "울산", "세종", "경기", "강원", "충북", "충남", "전북", "전남", "경북", "경남", "제주"],
        staList: []
    };
class Pews extends Events.EventEmitter {
    loop;
    sync = 2000;
    servertime = 0;
    sim = false;
    islog = true;
    _lastphase = 1;
    _lasteqk;
    serverURL = "/pews/data/";
    lcs;
    constructor() {
        super();
        this._PewsSync();
        this.on("newListener", (e, listener) => {
            this.Log("Listener Connected:", e);
        });
    }
    Log(...arg) {
        if (this.islog) console.log("[Pews Module]", ...arg);
    }
    Start(delay) {
        let last;
        this.loop = setInterval(() => {
            if (!this.sim) {
                const unixsec = Math.floor((Date.now() - this.sync) / 1000);
                if (last !== unixsec) {
                    this.servertime = new Date(unixsec * 1000);
                    this._pewsRequest();
                    last = unixsec;
                }
            }
            else {
                let t = this.servertime;
                this.servertime = new Date(t.setSeconds(t.getSeconds() + 1));
                this._pewsRequest();
            }
        }, delay);
    }
    Stop() {
        clearInterval(this.loop);
        this.loop = null;
    }
    _calcSync(unix) {
        return Date.now() - Number(unix) * 1000 + 1000;
    }
    _pewsRequest() {
        if (typeof (this.servertime) !== "object") return;
        this.lcs = Date.now();
        const stime = this._timeFormat(this.servertime),
            requrl = `${this.serverURL}${stime}.b`;
        if (!this.serverURL.includes("local:")) {
            this._HTTP(requrl, fuils.binarytimeout)
                .then(arg => {
                    this.sync = this._calcSync(arg[2].headers.st);
                    if (!this.sim) this.Log("[SYNC]", this.sync, "ms");
                    if (!(!arg || !arg[0] || arg[2].statusCode !== 200)) {
                        this.binaryHandler(arg[0]);
                        return this.emit("binary", arg[0], stime + ".b");
                    }
                    this.Log("[SYNC] Error:", arg[2].statusCode, requrl);
                    this.emit("reqFail", requrl, arg[2].statusCode);
                })
                .catch(e => {
                    this.Log("[BFILE] Error:", e);
                })
                .finally(() => {
                    this.emit("tick", requrl);
                });
        }
        else {
            try {
                const fs = require("fs"),
                    path = requrl.replace("local:", "");
                this.Log("[BFILE][LSDM] Loaded:", path);
                this.binaryHandler(fs.readFileSync(path, { encoding: null }));
            }
            catch (e) {
                this.Log("[BFILE][LSDM] Error:", e);
            }
        }
    }
    binaryHandler(b) {
        const bin = new Uint8Array(b);
        let header = "", binaryStr = "";
        for (let i = 0; i < fuils.headerLen; i++) {
            header += fuils.lpad(bin[i].toString(2), 8);
        }
        for (let i = fuils.headerLen; i < bin.byteLength; i++) {
            binaryStr += fuils.lpad(bin[i].toString(2), 8);
        }
        let phase = 1;
        if (header.substr(1, 1) === "0") phase = 1;
        else if (header.substr(1, 1) === "1" && header.substr(2, 1) === "0") phase = 2;
        else if (header.substr(2, 1) === "1") phase = 3;
        if (this._lastphase !== phase) {
            this.emit("phaseChange", phase);
            this._lastphase = phase;
        }
        this.emit("phase", phase);
        if (!this.sim) {
            const newId = "20" + parseInt(header.substr(6, 26), 2);
            if (!this.lastid || Number(this.lastid) < Number(newId)) {
                if (this.lastid) this.Log("EQKID is Updated.");
                this.lastid = newId;
                if (this._events.eqkList) this.eqklistRequest(this.lastid);
                if (this._events.eqkSimList) this.eqksimlistRequest(this.lastid);
            }
        }
        if (this._events.Station) {
            if (header.substr(0, 1) === "1" || fuils.staList.length < 99) {
                this.Log("[Station]", "List update by " + (header.substr(0, 1) !== "1" ? "client" : "server"));
                this._getSta(binaryStr);
            }
            else this._StaCallback(binaryStr);
        }
        if (!this._events.eqkInfo || phase === 1) {
            this.Log("LAG:", this.lagcalc(), "ms");
            return;
        }
        let infoStrArr = [];
        for (let i = bin.byteLength - fuils.maxEqkStrLen; i < bin.byteLength; i++) {
            infoStrArr.push(bin[i]);
        }
        const data = binaryStr.substr(0 - ((fuils.maxEqkStrLen * 8 + fuils.maxEqkInfoLen))),
            eqkMaxAreaStr = data.substr(99, 17),
            eqkId = "20" + parseInt(data.substr(69, 26), 2);
        let eqkMaxArea = [], eqkMaxAreaCode = [];
        if (eqkMaxAreaStr !== "11111111111111111") {
            for (let i = 0; i < 17; i++) {
                if (eqkMaxAreaStr.charAt(i) === "1") {
                    eqkMaxArea.push(fuils.ra[i]);
                    eqkMaxAreaCode.push(i);
                }
            }
        }
        else eqkMaxArea.push("-");
        const ep = `${eqkId}|${phase}`;
        if (this._lasteqk !== ep) {
            this._lasteqk = ep;
            this.emit("eqkInfo", {
                lat: 30 + (parseInt(data.substr(0, 10), 2) / 100),
                lon: 124 + (parseInt(data.substr(10, 10), 2) / 100),
                mag: (parseInt(data.substr(20, 7), 2) / 10).toFixed(1),
                dep: parseInt(data.substr(27, 10), 2) / 10,
                time: Number(parseInt(data.substr(37, 32), 2) + "000"),
                id: eqkId,
                max: parseInt(data.substr(95, 4), 2),
                areas: eqkMaxArea,
                areaCode: eqkMaxAreaCode,
                loc: decodeURIComponent(escape(String.fromCharCode.apply(null, infoStrArr))).trim()
            });
            if (this._events.gridArray) this._getGrid(eqkId, phase);
            if (!this.sim) {
                if (this._events.eqkList) this.eqklistRequest(eqkId);
                if (this._events.eqkSimList) this.eqksimlistRequest(eqkId);
            }
        }
        this.Log("LAG:", this.lagcalc(), "ms");
    }
    _getSta(data) {
        const stime = this._timeFormat(this.servertime),
            requrl = `${this.serverURL}${this._timeFormat(this.servertime)}.s`;
        if (!this.serverURL.includes("local:")) {
            this._HTTP(requrl, fuils.statimeout)
                .then(arg => {
                    if (!(!arg || !arg[0] || arg[2].statusCode !== 200)) {
                        this.StabufferHandler(arg[0], data);
                        return this.emit("binary", arg[0], stime + ".s");
                    }
                    this.Log("[Station] Error:", arg[2].statusCode, requrl);
                    return this.emit("reqFail", requrl, arg[2].statusCode);
                })
                .catch(e => {
                    this.Log("[Station] Error:", e);
                })
                .finally(() => {
                    this.emit("tick", requrl);
                });
        }
        else {
            try {
                const fs = require("fs"),
                    path = this.serverURL.replace("local:", "") + "stations.s";
                this.Log("[Station][LSDM] Loaded:", path);
                this.StabufferHandler(fs.readFileSync(path, { encoding: null }));
            }
            catch (e) {
                this.Log("[Station][LSDM] Error:", e);
                this.Log("[WARNING] No required data!!!");
            }
        }
    }
    StabufferHandler(buf, data) {
        if (!buf) return;
        const byteArray = new Uint8Array(buf);
        let binaryStr = "";
        for (let i = 0; i < byteArray.byteLength; i++) {
            binaryStr += fuils.lpad(byteArray[i].toString(2), 8);
        }
        this._StaBinHandler(binaryStr);
        this._StaCallback(data);
    }
    _StaBinHandler(binaryData) {
        if (!binaryData) return this.Log("[Station]", "Handling fail: No required argument values!");
        function findstaname(id, lat, lon) {
            if (!(lat >= 33) || !(lat <= 43) || !(lon >= 124) || !(lon <= 132))
                return { name: id + "번", orglat: lat, orglon: lon };
            const deg2rad = (deg) => { return deg * (Math.PI / 180); };
            let similar = [];
            for (let i in stanamelist) {
                const R = 6371,
                    dLat = deg2rad(stanamelist[i].lat - lat),
                    dLon = deg2rad(stanamelist[i].lon - lon),
                    a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(deg2rad(lat)) * Math.cos(deg2rad(stanamelist[i].lat)) * Math.sin(dLon / 2) * Math.sin(dLon / 2),
                    c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)),
                    dis = Math.floor(R * c);
                similar.push({ orglat: stanamelist[i].lat, orglon: stanamelist[i].lon, name: stanamelist[i].name, code: stanamelist[i].code, dis: dis });
            }
            similar = similar.sort(function (a, b) {
                return a["dis"] - b["dis"];
            });
            return (similar[0].dis < 24 ? { name: similar[0].name, orglat: similar[0].orglat, orglon: similar[0].orglon, code: similar[0].code } : { name: id + "번", orglat: lat, orglon: lon });
        }
        let newStaList = [], staLatArr = [], staLonArr = [];
        for (let i = 0; i < binaryData.length; i += 20) {
            staLatArr.push(30 + (parseInt(binaryData.substr(i, 10), 2) / 100));
            staLonArr.push(120 + (parseInt(binaryData.substr(i + 10, 10), 2) / 100));
        }
        for (let i = 0; i < staLatArr.length; i++) {
            let staInfo = [];
            const datareplace = findstaname(i, staLatArr[i], staLonArr[i]);
            staInfo.name = datareplace.name;
            staInfo.code = datareplace.code;
            staInfo.lat = datareplace.orglat;
            staInfo.lon = datareplace.orglon;
            staInfo.idx = i;
            newStaList.push(staInfo);
        }
        if (newStaList.length > 99) fuils.staList = newStaList;
    }
    _StaCallback(data) {
        const mmiObject = this._mmiBinHandler(data);
        if (!mmiObject) return;
        for (let i = 0; i < fuils.staList.length; i++) {
            fuils.staList[i].mmi = mmiObject.mmiData[fuils.staList[i].idx] || 1;
        }
        this.emit("Station", fuils.staList);
    }
    _mmiBinHandler(binaryData) {
        const mmiObj = { mmiData: [] };
        if (!binaryData) return mmiObj;
        if (binaryData && binaryData.length > 0) {
            for (let i = 0; i < binaryData.length; i += 4)
                mmiObj.mmiData.push(parseInt(binaryData.substr(i, 4), 2));
        }
        return mmiObj;
    }
    _getGrid(id, phase) {
        const dotalpha = phase === 2 ? ".e" : ".i", requrl = `${this.serverURL}${id}${dotalpha}`;
        if (!this.serverURL.includes("local:")) {
            this._HTTP(requrl, fuils.gridtimeout)
                .then(arg => {
                    if (!(!arg || !arg[0] || arg[2].statusCode !== 200)) {
                        const gridArr = this._gridBufHandler(arg[0]);
                        if (gridArr.length < 17666)
                            return setTimeout(() => {
                                this._getGrid(id, phase);
                            }, 200);
                        this.emit("gridArray", gridArr);
                        if (this._events.binary) this.emit("binary", arg[0], `${id}${dotalpha}`);
                        return;
                    }
                    this.Log("[Grid] Error:", arg[2].statusCode, requrl);
                    this.emit("reqFail", requrl, arg[2].statusCode);
                })
                .catch(e => {
                    this.Log("[Grid] Error:", e);
                })
                .finally(() => {
                    this.emit("tick", requrl);
                });
        }
        else {
            try {
                const fs = require("fs"),
                    path = this.serverURL.replace("local:", "") + "grid" + dotalpha,
                    gridArr = this._gridBufHandler(fs.readFileSync(path, { encoding: null }));
                this.Log("[Grid][LSDM] Loaded:", path);
                this.emit("gridArray", gridArr);
            }
            catch (e) {
                this.Log("[Grid][LSDM] Error:", e);
                this.Log("[WARNING] No required data!!!");
            }
        }
    }
    _gridBufHandler(buf) {
        const byteArray = new Uint8Array(buf);
        let gridArr = [];
        for (let i = 0; i < byteArray.length; i++) {
            const gridStr = fuils.lpad(byteArray[i].toString(2), 8);
            gridArr.push(parseInt(gridStr.substr(0, 4), 2));
            gridArr.push(parseInt(gridStr.substr(4, 4), 2));
        }
        return gridArr;
    }
    _timeFormat(time) {
        if (typeof (time) === "string") return time;
        let r = time.getUTCFullYear();
        r += String(time.getUTCMonth() + 1).padStart(2, "0");
        r += String(time.getUTCDate()).padStart(2, "0");
        r += String(time.getUTCHours()).padStart(2, "0");
        r += String(time.getUTCMinutes()).padStart(2, "0");
        r += String(time.getUTCSeconds()).padStart(2, "0");
        return r;
    }
    _timeTobj(str) {
        if (typeof (str) === "object") return str;
        str = String(str);
        const r = new Date();
        r.setUTCFullYear(str.substr(0, 4));
        r.setUTCMonth(Number(str.substr(4, 2)) - 1);
        r.setUTCDate(str.substr(6, 2));
        r.setUTCHours(str.substr(8, 2));
        r.setUTCMinutes(str.substr(10, 2));
        r.setUTCSeconds(str.substr(12, 2));
        return r;
    }
    _PewsSync() {
        this.Stop();
        if (!this.sim) {
            this._HTTP("/pews/")
                .then(arg => {
                    if (!(!arg || !arg[0] || arg[2].statusCode !== 200 || !arg[2].headers.st)) {
                        this.sync = this._calcSync(arg[2].headers.st);
                        this.Log("[SYNC] Time synchronization successful.");
                    }
                    else this.Log("[SYNC] Get PEWS server time: Invalid response");
                    this.Start(10);
                })
                .catch(err => {
                    this.Log("[SYNC] Get PEWS server time fail:", err);
                });
        }
    }
    GetLocationMMI(lat, lon, gridArr) {
        let cnt = 0, locmmi = 1;
        if (gridArr.length > 0) {
            for (let i = 38.85; i > 33; i -= 0.05) {
                for (let j = 124.5; j < 132.05; j += 0.05) {
                    if (Math.abs(lat - i) < 0.025 && Math.abs(lon - j) < 0.025) {
                        locmmi = gridArr[cnt];
                        if (locmmi > 11) locmmi = 1;
                        break;
                    }
                    cnt++;
                }
            }
        }
        return locmmi;
    }
    _HTTP(path, timeout) {
        return new Promise((resolve, reject) => {
            let chunk = Buffer.alloc(0);
            const https = require("https"),
                r = https.request({
                    hostname: "www.weather.go.kr",
                    path: path,
                    method: "GET",
                    timeout: timeout || 1000,
                    headers: {
                        "Accept": "*/*",
                        "Accept-Encoding": "gzip, deflate, br",
                        "Accept-Language": "ko,en;q=0.9,en-US;q=0.8",
                        "Connection": "keep-alive",
                        "Host": "www.weather.go.kr",
                        "Referer": "https://www.weather.go.kr/pews/pews.html",
                        "Sec-Fetch-Dest": "empty",
                        "Sec-Fetch-Mode": "cors",
                        "Sec-Fetch-Site": "same-origin",
                        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/87.0.4280.88 Safari/537.36 Edg/87.0.664.66",
                    }
                }, (res) => {
                    res.on("data", data => {
                        chunk = Buffer.concat([chunk, data], chunk.byteLength + Buffer.from(data).byteLength);
                    });
                    res.once("close", () => {
                        resolve([chunk, this.servertime, res]);
                    });
                });
            r.once("error", (err) => {
                reject(err.message);
            });
            r.once("timeout", () => {
                reject("timeout");
                this.Log("[HTTP]", "PEWS Server request timeout!");
            });
            r.end();
        });
    }
    lagcalc() {
        return Date.now() - this.lcs;
    }
    StopSimulation() {
        this.Stop();
        this.sim = false;
        this.serverURL = "/pews/data/";
        this.servertime = 0;
        fuils.headerLen = 4;
        fuils.staList = [];
        this.Start(10);
    }
    StartSimulation(id, time, hlen) {
        if (!this.loop) {
            return setTimeout(() => {
                this.StartSimulation(id, time, hlen);
            }, 100);
        }
        this.Stop();
        this.sim = true;
        this.servertime = this._timeTobj(time);
        this.servertime = new Date(this.servertime.setHours(this.servertime.getHours() - 9));
        fuils.staList = [];
        if (!id.includes("local:")) this.serverURL = "/pews/data/" + id + "/";
        else this.serverURL = `./${id}/`;
        fuils.headerLen = hlen;
        this.Start(1000);
    }
}
module.exports = Pews;