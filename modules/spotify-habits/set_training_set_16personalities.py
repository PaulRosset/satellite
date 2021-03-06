#!/usr/bin/env python3
import sys
import csv
import shutil
import tempfile
import urllib.request
import satellipy.configuration.mongo as MongoConf

if __name__ == '__main__':
    mongo_client = MongoConf.get_client(MongoConf.parse_env())
    collection = mongo_client['collections']['personalities']

    trainingFile = "training_set.csv"

    # Fetch csv
    if len(sys.argv) > 1:
        if sys.argv[1].startswith("http://"):
            with urllib.request.urlopen('http://python.org/') as response:
                with tempfile.NamedTemporaryFile(delete=False) as tmp_file:
                    shutil.copyfileobj(response, tmp_file)
                    trainingFile = tmp_file.name
        else:
            trainingFile = sys.argv[1]

    print("Reading from file at %s" % (trainingFile))

    # Read CSV
    with open(trainingFile, "r") as f:
        reader = csv.reader(f)
        for row in reader:
            id = row[0]
            personality_label = row[1]
            if collection.find({'user_id': id}).count() == 0:
                # Insert row
                print("Inserting %s as %s" % (id, personality_label))
                collection.insert_one({
                   'user_id': id,
                   'personality_label': personality_label,
                   'predicted': False,
                   'processed': False,
                })
            else:
                print("User %s already in database" % (id))
