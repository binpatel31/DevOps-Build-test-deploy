const Random = require('random-js');
const fs = require('fs');
const path = require('path');
const stackTrace = require('stacktrace-parser');
const spawnSync = require('child_process').spawnSync;
const rimraf = require("rimraf")

var iterations;
const srcDirectory = path.join("/home/vagrant/iTrust2-v8/iTrust2")

if (process.argv.length > 2) {
    iterations = process.argv[2]
}

class mutater {
    static random() {
        return mutater._random || mutater.seed(0)
    }

    static seed(kernel) {
        mutater._random = new Random.Random(Random.MersenneTwister19937.seed(kernel));
        return mutater._random;
    }

    static mutateStr(str) {
        var array = str.split("\n");
        let n = array.length
        // console.log(n)
        let tenPercent = n / 5
        let rSet = new Set()
        while(rSet.size < tenPercent) {
            rSet.add(mutater._random.integer(0, array.length - 1))
        }
        //console.log(rSet)
        var cp = [];
        for (var i = 0; i < array.length; i++){
            let elem;
            if(rSet.has(i)) {

                elem = array[i]
                // console.log(i);
                if (!isImportOrPackage(elem.trim())) {
                    // swap == with !=
                    elem = elem.replace(/==/g, ' != ')

                    // swap 0 with 1
                    elem = elem.replace(/0/g, '1')

                    // swap < with >
                    elem = elem.replace(/[^(List)|(Collection)|(Map)|(Set)|(SortedSet)|(Map.Entry)|(SortedMap)|(Enumeration)]</g, ">")

                    // 1) our own choice mutation replacing else if with if
                    elem = elem.replace(/else(\s*)if/gm, "if")

                    // 2) our own choice mutation replacing && with ||
                    elem = elem.replace(/&&/g, " || ")

                    // mutate string
                    if (elem.includes('\"')) {
                        elem = elem.replace(/"(.*?)"/g,
                            `"${mutater._random.string(mutater._random.integer(0, elem.length + 10))}"`);
                    }

                }
            }
            else {
                elem = array[i];
            }
            // console.log(elem)
            cp.push(elem)

        }

         // console.log(cp)

        return cp.join('\n')
    }

}

/*
Check if the string that we are trying to mutate is an import or package statement or any annotation or comment
 */

function isImportOrPackage(str) {
    if (str.startsWith("package") || str.startsWith("import")
        || str.startsWith("/*") || str.startsWith("*")
        || str.startsWith("//") || str.includes("@")) {

        return true;
    }
    return false;
}

function mutationTesting(paths,iterations, path_mutation_dir)
{

    var testResults = [];
    var tmpdirpath = path.join(srcDirectory,'tmp');
    // var modified_files = paths.length/10;
    passedTests = 0;
    
    if (!fs.existsSync(path_mutation_dir)) {
        fs.mkdirSync(path_mutation_dir);
    }
    else {
    	rimraf.sync(path_mutation_dir)
	fs.mkdirSync(path_mutation_dir);
   
    }


    //Run the mutation fnction multiple times
    for (var iter = 1; iter <= iterations; iter++) {
        //Create a tmp directory if it doesn't exists
        if (!fs.existsSync(tmpdirpath)) {
            fs.mkdirSync(tmpdirpath);
        }
	let iterDirPath = path.join(path_mutation_dir, iter.toString())
	if (!fs.existsSync(iterDirPath)){
	    fs.mkdirSync(iterDirPath);
	}
        var modfilescache = {};
        // console.log(`\nModified Files in iteration ${iter}:\n`);
        for (var i = 0; i < 1; i++) {
            var filepath = paths[mutater._random.integer(0,paths.length-1)];
            //console.log(filepath);
            var filesplit = filepath.split(path.sep);
            var filename = filesplit[filesplit.length-1];
            var src = fs.readFileSync(filepath,'utf-8');
            var dstpath = path.join(tmpdirpath, filename);
            //If file already mutated, skip the file
            if(modfilescache.hasOwnProperty(dstpath))
                continue;
            //Store the path to modified files in a dict
            modfilescache[dstpath] = filepath;
            //Copy the original file to tmp folder
            try {
                fs.copyFileSync(filepath, dstpath)
            }catch (err) {
                throw err;
            }
            //Mutate the file
            mutatedString = mutater.mutateStr(src);
            //Write back the mutated file to original location
            //console.log(mutatedString)
            fs.writeFileSync(filepath, mutatedString, (err) => {
                if (err) throw err;
            });
		let iterFilePath = path.join(iterDirPath, filename)
            fs.writeFileSync(iterFilePath, mutatedString, (err) => {
                if (err) throw err;
            });

        }

        try
        {
            //Run the test suite
            var output = spawnSync(`cd ${srcDirectory} && mvn clean test verify org.apache.maven.plugins:maven-checkstyle-plugin:3.1.0:checkstyle`, { encoding: 'utf-8', stdio: 'pipe' , shell: true });
            //Push the test results to the array
          //  console.log("++++++++")
           // console.log(iter)
	//	console.log(output.stdout)
            testResults.push( {input: iter, stack: output.stdout} );

        }
        catch(e)
        {
            // If build fails restart iteration
            console.log("Build error: Restarting iteration\n" + e);
            iter--;
        }

        //Copy the original files back to the working directory
        revertfiles(modfilescache,tmpdirpath);
    }

    failedTests = {};
    // Get failed tests in each iteration
    // console.log(testResults)
    let countFailed = 0

    for( var i =0; i < testResults.length; i++ )
    {
        let flag = false
        var failed = testResults[i];
        var msg = failed.stack.split("\n");
	//console.log(msg)
	let mainName = "FAILURE!"
        msg.filter(function(line) {
            if(line.includes("<<< FAILURE!") || line.includes("<<< ERROR!") || line.includes("FAILURE!") || line.includes("ERROR!") ){
                var temp = line.split(" ");
	//	    console.log(temp[1])
                var test =  temp[1].substring(temp[1].indexOf("(") + 1,temp[1].indexOf(")")) + "." + temp[1].split("(")[0];
         //       console.log(test)
		let currDir = temp[temp.length - 1]
	    if(currDir !=='FAILURE!' && currDir !== 'ERROR!')
		    mainName = currDir 
	    test = mainName + test
	//    console.log(test)
                if (test in failedTests){
                    let arr = failedTests[test]
			arr.push(failed.input)

			failedTests[test] = arr;
		}
                else
                    failedTests[test] = [failed.input]

                if(!flag) {
                    countFailed += 1
                    flag = true
                }
            }
        });
    }
    //console.log(countFailed)

    // Create items array
    var items = Object.keys(failedTests).map(function(key) {
        return [key, failedTests[key]];
    });
    // console.log(items)

    // Sort the array based on the second element
    items.sort(function(first, second) {
        return second[1] - first[1];
    });
    // console.log(items)
    //Print test results
	let percentage = (countFailed / iterations ) * 100
    console.log(`Overall mutation coverage: ${countFailed}/${iterations} (${percentage}%) mutations caught by the test suite.`)
	console.log("Useful tests" + "\n" + "============")
	//console.log(items.length)
    items.forEach(item => {
	    let splitted = item[0].split(".")
	    //console.log("h-----------------------------------------")
	    //console.log(splitted)

        //console.log(splitted[splitted.length - 1].substring(0, 5) )
        if (splitted[splitted.length - 1].substring(0, 4)  === "test") {
            console.log(`${item[1].length}/${iterations} ` + item[0])
		let failedIter = item[1]
		for(var i = 0; i < failedIter.length; i++) {
			let filenames = fs.readdirSync("/home/vagrant/mutation_dir" + "/" + failedIter[i].toString())
			console.log(`\t- /home/vagrant/mutation_dir/${failedIter[i]}/${filenames[0]}`)
		}
        }

    });
}


function revertfiles(modfilescache, dirpath){
    // console.log("-----------------------------xxxxxxxxxxxxxxxxxxx")
    //console.log(dirpath)
    //console.log(modfilescache)
    if (fs.existsSync(dirpath)) {
        fs.readdirSync(dirpath).forEach((file, index) => {
            const curPath = path.join(dirpath, file);
      //       console.log(curPath + "\n" +modfilescache[curPath]);
            try {
                fs.copyFileSync(curPath, modfilescache[curPath])
            }catch (err) {
                throw err
            }
            fs.unlinkSync(curPath);
        });
        fs.rmdirSync(dirpath);
    }
}

function getsourcepath(){
    var srcdirpath = path.join(srcDirectory,'src','main','java');
    var srcpaths = [];
    //Get a list of source files
    traverseDir(srcdirpath, srcpaths);
    return srcpaths;
}

function traverseDir(dir,srcpaths) {
    // console.log(dir)
    // console.log(srcpaths)
    fs.readdirSync(dir).forEach(file => {
        // console.log(file)
        let fullPath = path.join(dir, file);

        if (fs.lstatSync(fullPath).isDirectory()) {
            traverseDir(fullPath , srcpaths);
        } else {
            let path_split = fullPath.split(".");
            if(path_split[path_split.length-1] == 'java')
                srcpaths.push(fullPath);
        }
    });
}

function main(){
    mutater.seed(11);
    paths = getsourcepath();
    path_mutation_dir = "/home/vagrant/mutation_dir"
    mutationTesting(paths,iterations, path_mutation_dir);
}


exports.mutationTesting = mutationTesting;
exports.mutater = mutater;

if (require.main === module){
    main();
}