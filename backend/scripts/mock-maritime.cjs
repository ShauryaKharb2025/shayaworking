const {mockMaritime}=require("../tests/helpers/maritimeMock");
const {server}=mockMaritime();
server.listen(Number(process.env.PORT||5090),"127.0.0.1",()=>console.log("Local mock Maritime endpoint; deterministic fixture, not live AI"));
