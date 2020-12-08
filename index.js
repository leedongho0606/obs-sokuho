const WebSocket = require("ws").Server,
    wss = new WebSocket({ port: 5950 }),
    pewsm = require("./utils/pews"),
    pews = new pewsm(),
    img = require("./utils/img"),
    pakage = require("./package.json");
let eqkdata = { show: "none", sound: "pause", info: "", areas: "", img: "", title: "긴급지진속보 (기상청)" };
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
                    console.log(msg);
                    break;
                case "pewssim":
                    if (msg.data.id && msg.data.time) pews.StartSimulation(msg.data.id, msg.data.time);
                    else pews.StopSimulation();
                    break;
            }
        } catch (e) {
            ws.send({ meesage: e });
        }
    });
});
wss.on("listening", () => {
    console.log("[WSS] Server is running on", wss.options.port + " port!");
});
pews.on("tick", console.log);
pews.on("pewsphaseChange", (phase) => {
    if (phase !== 2) {
        eqkdata.show = "none";
        eqkdata.sound = "pause";
        eqkdata.img = "";
        wss_brod();
    }
});
pews.on("pewsInfo", (phase, stime, obj) => {
    if (phase !== 2) return;
    console.log(obj);

    eqkdata.show = "block";

    eqkdata.title = "긴급지진속보 (기상청)";

    eqkdata.img = "";

    eqkdata.areas = obj.areas.join("　");//"서울 부산 대구 인천 광주 대전 울산 세종 경기 강원 충북 충남 전북 전남 경북 경남 제주"//obj.areas.join(" ");

    eqkdata.info = obj.loc.substr(0, 5) + "에 지진, 강한 흔들림에 주의";
    wss_brod();

    eqkdata.sound = "play";

    pews.once("pewsGrid", (gridArr) => { // 그리드 데이터 받고 이미지 그림.
        img.drawgrid({
            grid: gridArr,
            eol: {
                lat: obj.lat,
                lon: obj.lon
            }
        }, (cb) => {
            if (!cb) return eqkdata.img = "";
            eqkdata.img = cb;
            wss_brod();
        });
    });
});
function wss_brod() {
    wss.clients.forEach(function each(client) {
        client.send(JSON.stringify(eqkdata));
    });
}
/*
const rl = require('readline').createInterface({ input: process.stdin, output: process.stdout });
rl.on("line", line => {
    const args = line.trim().split(/ +/g), command = args.shift().toLowerCase(), argv = args.slice(0).join(" ").trim();
    if (command === "sim" && args[0] && args[1]) {
        pews.StartSimulation(args[0], args[1]);
        console.log("[PEWS]", "Simulation Start:", args[0], args[1]);
    }
});*
*/
process.title = "OBS-Sokuho V" + pakage.version + " - By LDH0606";
console.log("\n\n\nOBS-Sokuho V" + pakage.version + " - By LDH0606\n\n\n");