const WebSocket = require("ws").Server,
    wss = new WebSocket({ port: 5950 }),
    pewsm = require("./utils/pews"),
    pews = new pewsm(),
    img = require("./utils/img");
let eqkdata = { show: "none", sound: "pause", info: "", areas: "", img: "", title: "지진신속정보 (기상청)" };
wss.on("connection", (ws, req) => {
    if (req.socket.remoteAddress !== "::ffff:127.0.0.1") return console.log("[WSS] Not local:", req.socket.remoteAddress);
    console.log("[WSS] Connect: " + req.socket.remoteAddress);
    ws.on("message", (msg) => {
        console.log(msg);
        try {
            msg = JSON.parse(msg);
            switch (msg.type) {
                case "get":
                    ws.send(JSON.stringify(eqkdata));
                    break;
                case "set":
                    eqkdata = msg.data;
                    wss_brod();
                    break;
                case "pewssim":
                    if (msg.data.id && msg.data.time) pews.StartSimulation(msg.data.id, msg.data.time, 1);
                    else pews.StopSimulation();
                    pews._lasteqk = null;
                    break;
            }
        } catch (e) {
            console.log("ERROR:", e);
            ws.send("{ meesage: " + e + "}");
        }
    });
});
wss.on("listening", () => {
    console.log("[WSS] Server is running on", wss.options.port + " port!");
});
pews.on("tick", console.log);
pews.on("phaseChange", (phase) => {
    if (phase !== 2) wssclear();
    wss_brod();
});
pews.on("eqkInfo", (obj) => {
    console.log(obj);
    if (pews._lastphase !== 2) return;
    wssclear();
    eqkdata.show = "none";
    eqkdata.title = "지진신속정보 (기상청)";
    eqkdata.waitimg = true;
    eqkdata.img = "";
    eqkdata.areas = obj.areas.join("　");//"서울　부산　대구　인천　광주　대전　울산　세종　경기　강원　충북　충남　전북　전남　경북　경남　제주";
    eqkdata.info = `${obj.loc.substr(0, 5)}에 규모${obj.mag} 지진, ${obj.max > 3 ? "강한" : ""} 흔들림에 주의!`;
    eqkdata.sound = "play";
    wss_brod();
    pews.once("gridArray", (gridArr) => {
        eqkdata.show = "block";
        // setTimeout(() => {
        img.drawgrid({
            grid: gridArr,
            eol: {
                lat: obj.lat,
                lon: obj.lon
            }
        }, (cb) => {
            if (!cb) return eqkdata.img = "";
            eqkdata.img = cb;
            eqkdata.waitimg = false;
            wss_brod();
        });
        // }, 3000);
    });
});
function wss_brod() {
    wss.clients.forEach(function each(client) {
        client.send(JSON.stringify(eqkdata));
    });
}
function wssclear() {
    eqkdata.show = "none";
    eqkdata.sound = "pause";
    eqkdata.img = "";
    eqkdata.info = null;
}
let pakage = require("./package.json");
process.title = "OBS-Sokuho V" + pakage.version + " - By LDH0606";
pakage = null;