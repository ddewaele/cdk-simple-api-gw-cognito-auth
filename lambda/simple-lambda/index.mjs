export const handler = async (event) => {
    console.log("Event = " + JSON.stringify(event));

    return {
        "statusCode": 200,
        "body": "ok"
    }
}
