#!/bin/sh

# copy tests
aws s3 cp $SUBMISSION ./Main.java

# copy src code
aws s3 --recursive cp $S3_tests ./tests

execute_test() {
    echo "Running test for $1"
    local test_status
    test_status=$2
    if [ $test_status != "CE" ]; 
    then
        java Main < tests/$1/input.txt > tests/$1/act_out.txt
        local exit_status=$?
        if [ $exit_status -eq 143 ];
        then
            echo "Time limit exceeded for $1"
            test_status="TLE"
        elif [ $exit_status -eq 0 ];
        then
            echo "Successfully ran the java code"
            diff -Z tests/$1/output.txt tests/$1/act_out.txt && test_status="AC" || test_status="WA"
        else
            echo "runtime error"
            test_status="RE"
        fi
    else
        echo "$1 is Compilation error"
        test_status="CE"
    fi
    echo "{\"testName\": \"$1\", \"testStatus\": \"$test_status\"}" >> test_result.txt 
}


# check for compilation erro
test_status="AC"
javac Main.java || test_status="CE"

# create test_result.txt file
rm -f test_result.txt
echo "{\"testExecutions\": [" > overall_result.txt

# iterate and execute each testCase
for test in $(ls tests);
do
    execute_test $test $test_status
done

echo "Waiting for completion of tests"
wait
echo "Completed tests"

cat test_result.txt | paste -s -d, >> overall_result.txt

echo "]}" >> overall_result.txt

cat overall_result.txt
