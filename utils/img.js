"use strict";
const jimp = require("jimp"),
    mmicolor = ["#FFFFFF", "#FFFFFF", "#A0E6FF", "#92D050", "#FFFF00", "#FFC000", "#FF0000", "#A32777", "#632523", "#4C2600", "#000000", "#000000", "#DFDFDF", "#BFBFBF", "#9F9F9F"],
    resource = {},
    zoom = 550,
    zoom_ban = (zoom / 2);
function msgbox(type, title, msg) {
    const cp = require("child_process");
    type = ["0x0", "0x10", "0x20", "0x30", "0x40"][type];
    /*
    중지0x10 
    물음표0x20
    느낌표0x30
    정보 마크0x40
    */
    cp.exec(`powershell (New-Object -ComObject Wscript.Shell).Popup("""${msg}""",0,"""${title}""",${type})`);
}
jimp.read("./res/map.png", (err, img) => {
    if (err) return msgbox(1, "SOKUHO - Error", "필수 리소스 파일 로드 실패: map.png");
    resource.map = img;
});
jimp.read("./res/loc.png", (err, img) => {
    if (err) return msgbox(1, "SOKUHO - Error", "필수 리소스 파일 로드 실패: loc.png");
    resource.loc = img.resize(50, 50);//.fade(0.5); // 투명도 50%;
});
module.exports = {
    drawgrid: (data, cb) => {
        let lag = Date.now(), cnt = 0;
        const background = new jimp(resource.map.getWidth(), resource.map.getHeight(), "#FFFFFF"), map = new jimp(resource.map);
        if (data.grid && data.grid.length > 0) {
            if (data.grid !== resource.grid) {
                resource.grid = data.grid;
                for (let i = 38.85; i > 33; i -= 0.05) {
                    for (let j = 124.5; j < 132.05; j += 0.05) {
                        if (Number(data.grid[cnt]) > 1) {
                            background.blit(new jimp(8, 8, mmitocolor(Number(data.grid[cnt]))), (fn_parseX(j) - 4), (fn_parseY(i) - 7));
                        }
                        cnt++;
                    }
                }
                console.log("grid imaging succes");
            }
        }
        background.blit(map, 0, 0);
        if (data.eol) {
            const lwh = resource.loc.getWidth() / 2,
                lhh = resource.loc.getHeight() / 2,
                px = fn_parseX(data.eol.lon) - lwh,
                py = fn_parseY(data.eol.lat) - lhh;
            background.blit(resource.loc, px, py, (err) => {
                console.log("발생위치 그리기 " + (err ? "실패" : "성공"));
                let cw = Math.floor(px - zoom_ban + lwh),
                    ch = Math.floor(py - zoom_ban + lhh);
                cw = cw < resource.map.getWidth() && cw > 0 ? cw : resource.map.getWidth();
                ch = ch < resource.map.getHeight() && ch > 0 ? ch - 50 : resource.map.getHeight();
                if (cw < resource.map.getWidth() && ch < resource.map.getHeight()) {
                    background.crop(cw, ch, zoom, 670, function (err) {
                        console.log("이미지 확대 " + (err ? "실패" : "성공"));
                    });
                }
            });
        }
        background.getBase64(jimp.MIME_PNG, (err, val) => {
            console.log("지도 이미지 처리" + (err ? "실패" : "성공"));
            if (err) return cb();
            cb(val);
            console.log("[IMG] LAG:", Date.now() - lag, "ms");
        });
    }
}
function fn_parseY(loc) {
    return (38.9 - Number(loc)) * 138.4;
}
function fn_parseX(loc) {
    return (Number(loc) - 124.5) * 113;
}
function mmitocolor(mmi) {
    return mmicolor.length > mmi ? mmicolor[mmi] : mmicolor[1];
}