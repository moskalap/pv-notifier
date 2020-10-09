var express = require('express');
var router = express.Router();
var fetch = require('node-fetch');
var push = require( 'pushsafer-notifications' );
const HUAWEI = 'https://eu5.fusionsolar.huawei.com';
const userName = process.env.USER;
const systemCode = process.env.PASS;


async function fetchAndParse(url, method, headers, body) {
    const response = await await fetch(
        url, {
        method,
        headers,
        body: JSON.stringify(body),

    });
    if (response.ok) {
        return {response, body: await response.json()};
    } else {
        throw new Error('Error while fetch');
    }
}
async function getHeaders() {
    const {response} = await fetchAndParse(`${HUAWEI}/thirdData/login`, 'POST',
        {
            'Content-Type': 'application/json'
        },
        {
            userName, systemCode
        }
    );

    if (response.ok) {

        const cookie = response.headers.get('set-cookie');
        const xsrf_token = cookie.split('XSRF-TOKEN=')[1].split(';')[0];
        const jsessionId = cookie.split('JSESSIONID=')[1].split(';')[0];

        const headers = {
            'XSRF-TOKEN': xsrf_token,
            'Cookie': `web-auth=true; XSRF-TOKEN='${xsrf_token}';JSESSIONID=${jsessionId}`,
            'Content-Type': 'application/json',
        };
        return headers;
    }
}

function getStationCode(headers) {
    return fetchAndParse(`${HUAWEI}/thirdData/getStationList`, 'POST', headers, {})
        .then(({body, response}) => {
            if(body.data[0]) {
                return body.data[0].stationCode
            }
            else throw new Error()
    })
}

async function getDailyProduction(headers, stationCodes ) {
    return fetchAndParse(`${HUAWEI}/thirdData/getStationRealKpi`, 'POST', headers, {stationCodes})
        .then(({body, response}) => {
            if(body.data[0]) {
                const dayPower = body.data[0].dataItemMap.day_power;

                const price = parseFloat(0.617 * Number(dayPower)).toFixed(2);

                return {price, dayPower}
            }
            else throw new Error()
        })
}

function sendNotification(price, dayPower, year_prod, year_use, day_prod, day_use) {
    const day_saldo = 0.8 * Number(day_prod) - day_use
    const year_saldo =  0.8 * Number(year_prod) - year_use
    var msgtoday = {
        m: `Dziś wyprodukowano ${dayPower} kWh\nWartość prądu: ${price} zł.`,   // message (required)
        t: "Fotowoltaika",                     // title (optional)
        s: '8',                                // sound (value 0-50)
        v: '2',                                // vibration (empty or value 1-3)
        // icon (value 1-176)
        c: '#FF0000',                          // iconcolor (optional)
        d: 'a'                               // the device or device group id
    };

    var msgyesterday = {
        m: `Wczoraj \noddano ${day_prod} kWh, Zużyto ${day_use}\nSaldo: ${day_saldo} Wartość prądu: ${day_saldo*0.61} zł.`,   // message (required)
        t: "Fotowoltaika",                     // title (optional)
        s: '8',                                // sound (value 0-50)
        v: '2',                                // vibration (empty or value 1-3)
        // icon (value 1-176)
        c: '#FF0000',                          // iconcolor (optional)
        d: 'a'                               // the device or device group id
    };


    var msgyear = {
        m: `Rocznie oddano ${year_prod} kWh, Zużyto ${year_use}\nSaldo: ${year_saldo} Wartość prądu: ${year_saldo*0.61} zł.`,   // message (required)
        t: "Fotowoltaika",                     // title (optional)
        s: '8',                                // sound (value 0-50)
        v: '2',                                // vibration (empty or value 1-3)
        // icon (value 1-176)
        c: '#FF0000',                          // iconcolor (optional)
        d: 'a'                               // the device or device group id
    };


    var p = new push( {
        k: 'dsI5nbrVsFfRjkb1kKUa',             // your 20 chars long private key
        debug: false
    });
    p.send( msgtoday, function( err, result ) {
        //console.log( 'ERROR:', err );
        console.log( 'RESULT', result );
        // process.exit(0);
    }); p.send( msgyesterday, function( err, result ) {
        //console.log( 'ERROR:', err );
        console.log( 'RESULT', result );
        // process.exit(0);
    }); p.send( msgyear, function( err, result ) {
        //console.log( 'ERROR:', err );
        console.log( 'RESULT', result );
        // process.exit(0);
    });
}

async function send_usage_stats() {

    getHeaders()
        .then(headers =>
            getStationCode(headers, )
                .then(stationCode => getDailyProduction(headers, stationCode))
                .then(async ({price, dayPower}) => {
                    const tauron = await fetch('https://pmoskala-tauron.herokuapp.com');
                    const text = await tauron.text();
                    [year_out, year_in, day_out, day_in] = text.replace('(', '').replace(')', '').split(',')
                    sendNotification(price, dayPower, year_out, year_in, day_out, day_in)
                })

        );


}

/* GET home page. */
router.get('/', function (req, res, next) {
    res.send('ok');
    req.retry = 5;


    try {
        send_usage_stats()
    } catch {
        setTimeout(() => {
            if (req.retry > 0) {
                req.retry -= 1;
                send_usage_stats();
            }
        }, 10000)
    }

});

module.exports = router;
