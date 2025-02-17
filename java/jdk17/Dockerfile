FROM alpine:3.21

RUN apk add aws-cli
RUN apk add openjdk17-jdk
RUN apk add diffutils

WORKDIR /hostcode

COPY ./run-test.sh run-test.sh
RUN chmod +x /hostcode/run-test.sh

CMD ["sh", "/hostcode/run-test.sh"]

